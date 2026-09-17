import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';

class UpdateMeDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  avatarUrl?: string;
}

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  async me(@CurrentUser() user: AuthUser) {
    const data = await this.users.getMe(user.id);
    return { success: true, data };
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update first/last name or avatar' })
  async updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    const data = await this.users.updateProfile(user.id, dto);
    return { success: true, data };
  }
}
