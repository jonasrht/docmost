import { Module } from '@nestjs/common';
import { AiAgentController } from './ai-agent.controller';
import { AiAgentService } from './ai-agent.service';
import { PageModule } from '../page/page.module';
import { SpaceModule } from '../space/space.module';
import { SearchModule } from '../search/search.module';
import { EnvironmentModule } from '../../integrations/environment/environment.module';

@Module({
  imports: [
    EnvironmentModule,
    PageModule,
    SpaceModule,
    SearchModule,
  ],
  controllers: [AiAgentController],
  providers: [AiAgentService],
  exports: [AiAgentService],
})
export class AiAgentModule {}
