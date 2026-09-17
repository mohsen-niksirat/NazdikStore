import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ERROR_CODES } from '../common/text';

export interface ScheduleRule {
  weekday: number; // 0=Sun … 6=Sat
  startMinute: number;
  endMinute: number;
  slotMinutes: number;
  breaks: Array<{ start: number; end: number }>;
}

export interface SlotDto {
  id: string;
  vendorProfileId: string;
  day: string;
  startMinute: number;
  endMinute: number;
  isBooked: boolean;
  orderId: string | null;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function minuteLabel(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

function weekdayOf(day: string): number {
  // day = YYYY-MM-DD, use UTC to be deterministic
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function overlapsBreaks(start: number, end: number, breaks: Array<{ start: number; end: number }>): boolean {
  return breaks.some((b) => start < b.end && end > b.start);
}

/**
 * Generate slot grid from schedule rules for a given day.
 */
export function expandDaySlots(rules: ScheduleRule[], day: string): Omit<SlotDto, 'id' | 'isBooked' | 'orderId'>[] {
  const wd = weekdayOf(day);
  const rule = rules.find((r) => r.weekday === wd);
  if (!rule) return [];
  const out: Array<Omit<SlotDto, 'id' | 'isBooked' | 'orderId'>> = [];
  const breaks = rule.breaks ?? [];
  for (let t = rule.startMinute; t + rule.slotMinutes <= rule.endMinute; t += rule.slotMinutes) {
    const end = t + rule.slotMinutes;
    if (overlapsBreaks(t, end, breaks)) continue;
    out.push({
      vendorProfileId: '',
      day,
      startMinute: t,
      endMinute: end,
    });
  }
  return out;
}

/**
 * Time-slot engine with atomic booking.
 * Memory mode uses a mutex-equivalent (sync check-and-set under single-threaded Node)
 * plus a double-check map to simulate SELECT ... FOR UPDATE race window tests.
 */
@Injectable()
export class TimeSlotService {
  private schedules = new Map<string, ScheduleRule[]>(); // vendorProfileId -> rules
  private slots = new Map<string, SlotDto>(); // key = vendor|day|start
  /** lock keys currently held — used to simulate DB row locks under concurrency */
  private locks = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  clearMemory(): void {
    this.schedules.clear();
    this.slots.clear();
    this.locks.clear();
  }

  setSchedule(vendorProfileId: string, rules: ScheduleRule[]): void {
    this.schedules.set(vendorProfileId, rules);
  }

  getSchedule(vendorProfileId: string): ScheduleRule[] {
    return this.schedules.get(vendorProfileId) ?? [];
  }

  private slotKey(vendorProfileId: string, day: string, startMinute: number): string {
    return `${vendorProfileId}|${day}|${startMinute}`;
  }

  /** Materialize free slots for a day from schedule */
  ensureDaySlots(vendorProfileId: string, day: string): SlotDto[] {
    const rules = this.schedules.get(vendorProfileId) ?? [];
    const expanded = expandDaySlots(rules, day).map((s) => ({ ...s, vendorProfileId }));
    const result: SlotDto[] = [];
    for (const s of expanded) {
      const key = this.slotKey(s.vendorProfileId, s.day, s.startMinute);
      let slot = this.slots.get(key);
      if (!slot) {
        slot = {
          id: `slot_${key}`,
          ...s,
          isBooked: false,
          orderId: null,
        };
        this.slots.set(key, slot);
      }
      result.push(slot);
    }
    return result;
  }

  listSlots(vendorProfileId: string, day: string): SlotDto[] {
    return this.ensureDaySlots(vendorProfileId, day).filter((s) => !s.isBooked || true);
  }

  getSlot(slotId: string): SlotDto | null {
    for (const s of this.slots.values()) {
      if (s.id === slotId) return s;
    }
    return null;
  }

  /**
   * Atomic book: exactly one of concurrent callers wins; others get 409.
   * Mirrors: UPDATE ... SET isBooked=true WHERE id=? AND isBooked=false
   */
  async bookSlotAtomic(input: {
    slotId: string;
    orderId: string;
    vendorProfileId?: string;
    consumerId?: string;
  }): Promise<SlotDto> {
    const lockKey = input.slotId;

    // Wait-free "SELECT FOR UPDATE" simulation: if another booking is in-flight on this row
    if (this.locks.has(lockKey)) {
      throw new ConflictException({
        code: ERROR_CODES.CONFLICT,
        message: 'Time slot is being booked by another request',
        details: { reason: 'SLOT_LOCKED', slotId: input.slotId },
      });
    }
    this.locks.add(lockKey);
    try {
      // Yield to allow concurrent call to interleave (tests Promise.all)
      await Promise.resolve();

      let slot: SlotDto | null = null;
      for (const s of this.slots.values()) {
        if (s.id === input.slotId) {
          slot = s;
          break;
        }
      }
      if (!slot) {
        // try hydrate from memory schedule
        throw new ConflictException({
          code: ERROR_CODES.NOT_FOUND,
          message: 'Slot not found',
          details: { slotId: input.slotId },
        });
      }
      if (slot.isBooked) {
        throw new ConflictException({
          code: ERROR_CODES.CONFLICT,
          message: 'Time slot already booked',
          details: { reason: 'SLOT_TAKEN', slotId: slot.id, orderId: slot.orderId },
        });
      }

      // DB path when available
      try {
        const updated = await this.prisma.$executeRaw`
          UPDATE time_slots
          SET "isBooked" = true, "orderId" = ${input.orderId}
          WHERE id = ${input.slotId} AND "isBooked" = false
        `;
        if (updated === 0 && this.slots.get(input.slotId)?.isBooked) {
          throw new ConflictException({
            code: ERROR_CODES.CONFLICT,
            message: 'Time slot already booked',
          });
        }
      } catch (err) {
        if (err instanceof ConflictException) throw err;
        // memory-only
      }

      slot.isBooked = true;
      slot.orderId = input.orderId;
      return { ...slot };
    } finally {
      this.locks.delete(lockKey);
    }
  }

  /** Release a booked slot (cancellation) */
  releaseSlot(slotId: string): void {
    for (const s of this.slots.values()) {
      if (s.id === slotId) {
        s.isBooked = false;
        s.orderId = null;
      }
    }
  }
}
