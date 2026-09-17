import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PaymentsService } from './payments.service';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/roles.decorator';

@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly wallet: WalletService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @Post('orders/:orderId/pay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start payment for order (Idempotency-Key supported)' })
  async startPayment(
    @CurrentUser() user: AuthUser,
    @Param('orderId') orderId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Body() body?: { provider?: string },
  ) {
    const data = await this.payments.createPaymentForOrder({
      orderId,
      consumerId: user.id,
      provider: body?.provider,
      idempotencyKey,
    });
    return { success: true, data };
  }

  @Public()
  @Post('payments/webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bank payment webhook (signature + idempotent ledger)' })
  async webhook(
    @Body()
    body: {
      provider?: string;
      authority?: string;
      refId?: string;
      status?: string;
      amount?: number;
      paymentId?: string;
      signature?: string;
    },
  ) {
    const data = await this.payments.processWebhook({
      ...body,
      rawPayload: {
        authority: body.authority,
        refId: body.refId,
        status: body.status,
        amount: body.amount,
      },
    });
    return { success: true, data };
  }

  @Public()
  @Get('payments/callback')
  @ApiOperation({ summary: 'Browser return URL from gateway' })
  async callback(
    @Query('Authority') authority: string,
    @Query('Status') status: string,
    @Res() res: Response,
  ) {
    const data = await this.payments.processWebhook({
      authority,
      status: status || 'OK',
      refId: undefined,
      rawPayload: { authority, status: status || 'OK' },
    });
    // Redirect to web app
    const web = process.env.WEB_BASE_URL ?? 'http://localhost:3000';
    res.redirect(`${web}/pay/result?paymentId=${data.paymentId}&status=${data.status}`);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('payments/:id')
  @ApiOperation({ summary: 'Payment status' })
  getPayment(@Param('id') id: string) {
    return { success: true, data: this.payments.getPayment(id) };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('payments/:id/refund')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refund a paid payment' })
  refund(@Param('id') id: string, @Body() body?: { reason?: string }) {
    return { success: true, data: this.payments.refundPayment({ paymentId: id, reason: body?.reason }) };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('wallet/me')
  @ApiOperation({ summary: 'My wallet balance + ledger' })
  myWallet(@CurrentUser() user: AuthUser) {
    this.wallet.ensureWallet(user.id, 'USER');
    return {
      success: true,
      data: {
        balanceToman: this.wallet.getBalance(user.id),
        entries: this.wallet.listEntries(user.id).slice(0, 50),
      },
    };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('wallet/vendor/me')
  @ApiOperation({ summary: 'Vendor wallet + settlements' })
  vendorWallet(@CurrentUser() user: AuthUser) {
    const vp = user.role === 'VENDOR' ? `vp_${user.id}` : `vp_admin_${user.id}`;
    this.wallet.ensureWallet(vp, 'VENDOR');
    return {
      success: true,
      data: {
        ownerId: vp,
        balanceToman: this.wallet.getBalance(vp),
        settlements: this.wallet.listSettlements(vp),
        entries: this.wallet.listEntries(vp).slice(0, 50),
      },
    };
  }
}
