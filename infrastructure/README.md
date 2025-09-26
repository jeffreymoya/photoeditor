# Photo Editor Infrastructure

This directory contains Terraform configurations for the Photo Editor application infrastructure.

## Architecture Overview

The infrastructure consists of the following components:

### Core Services
- **S3 Buckets**: Temporary and final image storage with lifecycle policies
- **DynamoDB**: Job tracking table with TTL and encryption
- **Lambda Functions**: API handlers and worker functions with PowerTools
- **API Gateway**: HTTP API v2 for REST endpoints
- **SQS/SNS**: Messaging and notification infrastructure

### Supporting Services
- **CloudWatch**: Monitoring, logging, and alarms
- **KMS**: Encryption key management
- **SSM**: Parameter store for secrets and configuration
- **AWS Budgets**: Cost monitoring and alerting

## Module Structure

```
infrastructure/
├── main.tf              # Main configuration and module composition
├── variables.tf         # Input variables
├── outputs.tf           # Output values
├── terraform.tfvars.example  # Example configuration
└── modules/
    ├── api-gateway/     # API Gateway HTTP API v2
    ├── budgets/         # Cost management and budgets
    ├── dynamodb/        # DynamoDB jobs table
    ├── lambda/          # Lambda functions and IAM roles
    ├── monitoring/      # CloudWatch dashboards and alarms
    ├── s3/              # S3 buckets with lifecycle policies
    ├── sns/             # SNS topic and platform applications
    └── sqs/             # SQS queue and dead letter queue
```

## Deployment

### Prerequisites
- AWS CLI configured with appropriate credentials
- Terraform >= 1.6.0
- S3 bucket for Terraform state (for production)

### Steps

1. **Initialize Terraform**
   ```bash
   terraform init
   ```

2. **Create configuration**
   ```bash
   cp terraform.tfvars.example terraform.tfvars
   # Edit terraform.tfvars with your configuration
   ```

3. **Plan deployment**
   ```bash
   terraform plan
   ```

4. **Apply changes**
   ```bash
   terraform apply
   ```

## Configuration

### Required Variables
- `environment`: Environment name (dev, stage, prod)

### Important Configuration
- **Budget Notifications**: Update `budget_notification_emails` with actual email addresses
- **API Endpoints**: Configure `gemini_api_endpoint` and `seedream_api_endpoint`
- **Resource Limits**: Adjust Lambda memory, API throttling, and budget limits

### Secrets Management
After deployment, update SSM parameters with actual API keys:
```bash
aws ssm put-parameter --name "/photo-editor-dev/gemini/api-key" --value "your-api-key" --type "SecureString" --overwrite
aws ssm put-parameter --name "/photo-editor-dev/seedream/api-key" --value "your-api-key" --type "SecureString" --overwrite
```

## Monitoring

The infrastructure includes comprehensive monitoring:

- **CloudWatch Dashboard**: Real-time metrics visualization
- **Alarms**: Automated alerts for errors, throttling, and performance issues
- **Log Insights**: Pre-configured queries for error and performance analysis
- **Cost Monitoring**: Budget alerts at multiple thresholds

## Security Features

- **Encryption at Rest**: KMS encryption for DynamoDB, S3, and SNS
- **Encryption in Transit**: HTTPS/TLS for all communications
- **IAM Least Privilege**: Minimal required permissions for each service
- **Network Security**: Private subnets and security groups (when applicable)
- **Secret Management**: SSM Parameter Store with KMS encryption

## Cost Optimization

- **S3 Lifecycle Policies**: Automatic transition to cheaper storage classes
- **DynamoDB On-Demand**: Pay-per-request billing
- **Lambda Reserved Concurrency**: Prevent runaway costs
- **CloudWatch Log Retention**: Automatic log cleanup
- **Budget Monitoring**: Multiple budget levels with email alerts

## Troubleshooting

### Common Issues

1. **Validation Errors**: Run `terraform validate` to check syntax
2. **Provider Version**: Ensure AWS provider version ~> 5.0
3. **Permissions**: Verify AWS credentials have required IAM permissions
4. **Resource Limits**: Check AWS service quotas for your account

### Useful Commands

```bash
# Check configuration
terraform validate

# Format code
terraform fmt -recursive

# Show current state
terraform show

# Import existing resources
terraform import <resource_type>.<name> <id>

# Destroy infrastructure
terraform destroy
```

## Next Steps

After infrastructure deployment:

1. **Lambda Deployment**: Deploy actual Lambda function code (Phase 4)
2. **API Testing**: Test API endpoints and error handling
3. **Mobile Integration**: Configure mobile app with API endpoints
4. **Monitoring Setup**: Configure alert destinations and dashboards
5. **Performance Testing**: Load test the system and adjust limits

## Support

For issues or questions:
- Check AWS CloudWatch logs for runtime errors
- Review Terraform state for resource status
- Validate configuration with `terraform plan`
- Check AWS service health dashboard

## Version History

- **v1.0**: Initial infrastructure setup with all core services
- Modular design with proper separation of concerns
- Comprehensive monitoring and cost controls
- Production-ready security and encryption