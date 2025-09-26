# GitHub Actions CI/CD Pipeline

This repository uses GitHub Actions for automated testing, building, and deployment of the Photo Editor application.

## Workflows

### 1. CI/CD Pipeline (`ci-cd.yml`)
Main pipeline for backend services and infrastructure:

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main`

**Jobs:**
- **Lint & Validate:** ESLint and TypeScript checks for shared and backend packages
- **Test Backend:** Runs Jest tests for backend services
- **Build Lambda Functions:** Builds Lambda functions using esbuild
- **Terraform Validate:** Validates infrastructure code
- **Security Scan:** Trivy vulnerability scanning
- **Deploy Dev:** Deploys to development environment (develop branch)
- **Deploy Prod:** Deploys to production environment (main branch)

### 2. Security & Maintenance (`security-and-maintenance.yml`)
Automated security and maintenance tasks:

**Triggers:**
- Daily at 2 AM UTC (scheduled)
- Manual trigger via workflow_dispatch

**Jobs:**
- **Security Audit:** npm audit for vulnerabilities
- **License Compliance:** Checks for approved licenses only
- **Dependency Updates:** Checks for outdated packages
- **Cost Monitoring:** AWS cost and budget monitoring

### 3. Mobile CI/CD (`mobile-ci-cd.yml`)
React Native mobile app pipeline:

**Triggers:**
- Push to `main` or `develop` branches (mobile/** paths only)
- Pull requests to `main` (mobile/** paths only)

**Jobs:**
- **Lint Mobile:** ESLint, TypeScript, and Jest for mobile app
- **Build Android:** Builds Android APK
- **Build iOS:** Builds iOS archive (macOS runner)
- **Deploy Beta:** Deploys to internal testing (develop branch)
- **Deploy Production:** Deploys to app stores (main branch)

## Required Secrets

### AWS Deployment
- `AWS_ACCESS_KEY_ID` - AWS access key for development
- `AWS_SECRET_ACCESS_KEY` - AWS secret key for development
- `AWS_REGION` - AWS region (e.g., us-east-1)
- `AWS_ACCESS_KEY_ID_PROD` - AWS access key for production
- `AWS_SECRET_ACCESS_KEY_PROD` - AWS secret key for production
- `AWS_REGION_PROD` - AWS region for production

### Mobile App Deployment
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` - Google Play Console service account
- Additional iOS/TestFlight secrets (when implemented)

## Environment Configuration

### Development Environment
- Environment name: `development`
- Terraform variables: `terraform.tfvars.dev`
- Lower resource limits and costs
- Debug logging enabled
- Shorter retention periods

### Production Environment
- Environment name: `production`
- Terraform variables: `terraform.tfvars.prod`
- Production resource limits
- Full monitoring and logging
- Compliance features enabled

## Branch Strategy

- **`main`** - Production branch, deploys to production environment
- **`develop`** - Development branch, deploys to development environment
- **Feature branches** - Only run lint, test, and build jobs

## Security Features

- Vulnerability scanning with Trivy
- License compliance checking
- Dependency auditing
- AWS cost monitoring
- Environment separation
- Least-privilege AWS IAM policies

## Getting Started

1. **Set up AWS credentials** in GitHub repository secrets
2. **Configure environments** in GitHub repository settings:
   - Create `development` environment
   - Create `production` environment (with protection rules)
3. **Update terraform.tfvars files** with your specific values
4. **Push to develop branch** to trigger first deployment

## Monitoring

- All deployments create CloudWatch dashboards
- Budget alerts are configured for cost monitoring
- Security scans run daily
- Dependency updates checked daily

## Troubleshooting

### Failed Deployments
- Check AWS credentials are valid
- Verify Terraform variables are correct
- Check AWS service limits
- Review CloudWatch logs

### Failed Tests
- Ensure all dependencies are installed
- Check TypeScript compilation
- Review Jest test output
- Verify environment variables

### Security Issues
- Review Trivy scan results
- Check npm audit output
- Update vulnerable dependencies
- Review license compliance report