import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrdersService, type OrderLineInput } from './orders.service';
import { TimeSlotService, minuteLabel } from './time-slot.service';
import { RfqService } from './rfq.service';
import { ORDER_STATUSES, canTransition, type OrderStatus } from './order-state';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/roles.decorator';
import { ERROR_CODES } from '../common/text';
import { BadRequestException } from '@nestjs/common';

class CartLineDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsString()
  @Length(1, 120)
  title!: string;

  @IsInt()
  @Min(0)
  unitPriceToman!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  variation?: string;
}

class CreateDeliveryOrderDto {
  @IsString()
  vendorProfileId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartLineDto)
  lines!: CartLineDto[];

  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;

  @IsOptional()
  @IsNumber()
  deliveryLat?: number;

  @IsOptional()
  @IsNumber()
  deliveryLng?: number;
}

class BookAppointmentDto {
  @IsString()
  vendorProfileId!: string;

  @IsString()
  slotId!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceToman?: number;
}

class TransitionDto {
  @IsString()
  status!: string;
}

class CreateJobDto {
  @IsString()
  @Length(1, 120)
  title!: string;

  @IsString()
  @Length(1, 2000)
  description!: string;

  @IsOptional()
  @IsArray()
  mediaIds?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  radiusKm?: number;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  budgetMaxToman?: number;
}

class QuoteDto {
  @IsInt()
  @Min(0)
  priceToman!: number;

  @IsInt()
  @Min(0)
  etaHours!: number;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  message?: string;
}

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly slots: TimeSlotService,
    private readonly rfq: RfqService,
  ) {}

  // ── Schedules / slots ──

  @Post('vendors/me/schedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set weekly working calendar (vendor)' })
  setSchedule(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      rules: Array<{
        weekday: number;
        startMinute: number;
        endMinute: number;
        slotMinutes?: number;
        breaks?: Array<{ start: number; end: number }>;
      }>;
    },
  ) {
    const vp = this.vpId(user);
    const rules = (body.rules ?? []).map((r) => ({
      weekday: r.weekday,
      startMinute: r.startMinute,
      endMinute: r.endMinute,
      slotMinutes: r.slotMinutes ?? 30,
      breaks: r.breaks ?? [],
    }));
    this.slots.setSchedule(vp, rules);
    return { success: true, data: { vendorProfileId: vp, rules } };
  }

  @Public()
  @Get('vendors/:id/slots')
  @ApiOperation({ summary: 'List bookable slots for a day' })
  listSlots(@Param('id') id: string, @Query('day') day?: string) {
    const dayStr = day ?? new Date().toISOString().slice(0, 10);
    const slots = this.slots.listSlots(id, dayStr).map((s) => ({
      ...s,
      startLabel: minuteLabel(s.startMinute),
      endLabel: minuteLabel(s.endMinute),
    }));
    return { success: true, data: { day: dayStr, slots } };
  }

  // ── Appointment booking ──

  @Post('orders/appointments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Book appointment slot (atomic; 409 if taken)' })
  async bookAppointment(@CurrentUser() user: AuthUser, @Body() dto: BookAppointmentDto) {
    try {
      const data = await this.orders.createAppointmentOrder({
        consumerId: user.id,
        vendorProfileId: dto.vendorProfileId,
        slotId: dto.slotId,
        note: dto.note,
        priceToman: dto.priceToman,
      });
      return { success: true, data };
    } catch (err) {
      throw err;
    }
  }

  // ── Delivery cart ──

  @Post('orders/delivery')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create delivery order from cart (stock + zone validated)' })
  async createDelivery(@CurrentUser() user: AuthUser, @Body() dto: CreateDeliveryOrderDto) {
    const lines: OrderLineInput[] = dto.lines.map((l) => ({
      productId: l.productId,
      title: l.title,
      unitPriceToman: l.unitPriceToman,
      quantity: l.quantity,
      variation: l.variation,
    }));
    const data = await this.orders.createDeliveryOrder({
      consumerId: user.id,
      vendorProfileId: dto.vendorProfileId,
      lines,
      deliveryAddress: dto.deliveryAddress,
      note: dto.note,
      deliveryLat: dto.deliveryLat,
      deliveryLng: dto.deliveryLng,
    });
    return { success: true, data };
  }

  // ── RFQ ──

  @Post('jobs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create RFQ job request broadcast to nearby vendors' })
  createJob(@CurrentUser() user: AuthUser, @Body() dto: CreateJobDto) {
    const data = this.rfq.createJobRequest({
      consumerId: user.id,
      title: dto.title,
      description: dto.description,
      mediaIds: dto.mediaIds,
      radiusKm: dto.radiusKm,
      lat: dto.lat,
      lng: dto.lng,
      budgetMaxToman: dto.budgetMaxToman,
    });
    return { success: true, data };
  }

  @Post('jobs/:id/quotes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vendor submits RFQ quote' })
  quote(@CurrentUser() user: AuthUser, @Param('id') jobId: string, @Body() dto: QuoteDto) {
    const data = this.rfq.submitQuote({
      jobRequestId: jobId,
      vendorProfileId: this.vpId(user),
      priceToman: dto.priceToman,
      etaHours: dto.etaHours,
      message: dto.message,
    });
    return { success: true, data };
  }

  @Get('jobs/:id/quotes')
  @ApiOperation({ summary: 'List quotes (consumer sees all; vendor sees own)' })
  listQuotes(@CurrentUser() user: AuthUser, @Param('id') jobId: string) {
    const data = this.rfq.listQuotes(jobId, user);
    return { success: true, data };
  }

  @Post('jobs/:id/quotes/:quoteId/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lock winning RFQ bid and create order' })
  acceptQuote(
    @CurrentUser() user: AuthUser,
    @Param('id') jobId: string,
    @Param('quoteId') quoteId: string,
  ) {
    const data = this.rfq.acceptQuote({
      jobRequestId: jobId,
      quoteId,
      consumerId: user.id,
    });
    return { success: true, data };
  }

  // ── Orders lifecycle ──

  @Get('orders/me')
  @ApiOperation({ summary: 'My consumer orders' })
  myOrders(@CurrentUser() user: AuthUser) {
    return { success: true, data: this.orders.listForConsumer(user.id) };
  }

  @Get('orders/vendor/me')
  @ApiOperation({ summary: 'Orders for my vendor profile' })
  vendorOrders(@CurrentUser() user: AuthUser) {
    return { success: true, data: this.orders.listForVendor(this.vpId(user)) };
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Order detail + allowed next transitions' })
  getOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const order = this.orders.get(id);
    if (user.role !== 'ADMIN' && user.id !== order.consumerId && user.id !== order.vendorProfileId && user.role !== 'VENDOR') {
      // memory vendors use vp_ prefix; allow consumer match only
      if (user.id !== order.consumerId) {
        throw new BadRequestException({
          code: ERROR_CODES.FORBIDDEN,
          message: 'Not a party to this order',
        });
      }
    }
    const next = ORDER_STATUSES.filter((s) => canTransition(order.status, s));
    return { success: true, data: { ...order, allowedTransitions: next } };
  }

  @Post('orders/:id/transitions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Advance order state machine' })
  async transition(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TransitionDto) {
    if (!ORDER_STATUSES.includes(dto.status as OrderStatus)) {
      throw new BadRequestException({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Unknown status',
      });
    }
    const data = await this.orders.transition(id, dto.status as OrderStatus, user);
    return { success: true, data };
  }

  private vpId(user: AuthUser): string {
    if (user.role === 'ADMIN') return `vp_admin_${user.id}`;
    if (user.role === 'VENDOR') return `vp_${user.id}`;
    throw new BadRequestException({
      code: ERROR_CODES.FORBIDDEN,
      message: 'Vendor role required',
    });
  }
}
