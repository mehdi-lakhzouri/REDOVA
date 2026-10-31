import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

/** REDOVA platform admin API (UM-007). */
@Module({
  controllers: [AdminUsersController],
  providers: [AdminUsersService],
})
export class AdminModule {}
