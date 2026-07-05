import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      useFactory: (): PrismaService => {
        const client = new PrismaService();
        client.registerRootClient(client);
        return client;
      },
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
