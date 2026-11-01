import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { IsOptional, IsString } from 'class-validator';
import { RequireCapability } from '../auth/capability.guard.js';
import { CurrentAccount } from '../auth/current-account.decorator.js';
import { GAME } from '../config/game.config.js';
import type { Account } from '../generated/prisma/client.js';
import { parseUpload, type ClickerUploadFiles } from './clicker-upload.js';
import { ClickersService } from './clickers.service.js';

class UploadDto {
  @IsString()
  spec!: string;

  @IsOptional()
  @IsString()
  faceDetected?: string;
}

const imageFields = () =>
  FileFieldsInterceptor(
    [
      { name: 'idle', maxCount: 1 },
      { name: 'pressed', maxCount: 1 },
    ],
    { limits: { fileSize: GAME.clicker.maxImageBytes } },
  );

@Controller('clickers')
export class ClickersController {
  constructor(private readonly clickers: ClickersService) {}

  /** 서버 업로드는 공유를 위해서만 존재하므로 공유 권한이 있어야 한다(동의 전 최소 수집). */
  @Post()
  @RequireCapability('share')
  @UseInterceptors(imageFields())
  create(
    @CurrentAccount() account: Account,
    @UploadedFiles() files: ClickerUploadFiles | undefined,
    @Body() dto: UploadDto,
  ) {
    return this.clickers.create(
      account,
      parseUpload(files, dto.spec, dto.faceDetected),
    );
  }

  @Put(':id')
  @RequireCapability('share')
  @UseInterceptors(imageFields())
  update(
    @CurrentAccount() account: Account,
    @Param('id') id: string,
    @UploadedFiles() files: ClickerUploadFiles | undefined,
    @Body() dto: UploadDto,
  ) {
    return this.clickers.update(
      account,
      id,
      parseUpload(files, dto.spec, dto.faceDetected),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentAccount() account: Account,
    @Param('id') id: string,
  ): Promise<void> {
    await this.clickers.remove(account, id);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.clickers.view(id);
  }
}
