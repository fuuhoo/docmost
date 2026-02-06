import { Injectable } from '@nestjs/common';
import { EnvironmentService } from './environment.service';

@Injectable()
export class DomainService {
  constructor(private environmentService: EnvironmentService) {}

  getUrl(hostname?: string): string {
    // In development mode, use the client-side URL for redirects
    // This ensures SSO callback redirects to the correct Vite dev server address
    if (!this.environmentService.isCloud() && this.environmentService.getNodeEnv() === 'development') {
      // For development, return localhost:5173 which is the Vite dev server default
      return 'http://localhost:5173';
    }

    if (!this.environmentService.isCloud()) {
      return this.environmentService.getAppUrl();
    }

    const domain = this.environmentService.getSubdomainHost();
    if (!hostname || !domain) {
      return this.environmentService.getAppUrl();
    }

    const protocol = this.environmentService.isHttps() ? 'https' : 'http';
    return `${protocol}://${hostname}.${domain}`;
  }
}
