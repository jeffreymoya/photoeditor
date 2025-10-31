/**
 * PhotoEditor Infrastructure - Main Configuration
 *
 * This is the root Terraform configuration for PhotoEditor infrastructure.
 * Per ADR-0008, SST stacks will eventually consume versioned modules defined here.
 *
 * Standards Compliance:
 * - infrastructure-tier.md L5-12: Terraform control plane with SST parity
 * - infrastructure-tier.md L7: Versioned modules with published changelogs
 * - infrastructure-tier.md L19-23: Fitness gates (validate, plan, drift detection, policy enforcement)
 * - cross-cutting.md L10-11: KMS encryption and mandatory cost tags
 *
 * Current State: Phase 2 - Module definitions exist but SST stacks still provision inline
 * See docs/infra/sst-parity-checklist.md for migration status
 */

terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # State backend configuration
  # For production, use S3 backend with DynamoDB state locking
  # backend "s3" {
  #   bucket         = "photoeditor-terraform-state"
  #   key            = "infrastructure/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "terraform-state-lock"
  #   encrypt        = true
  #   kms_key_id     = "alias/terraform-state"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project    = "PhotoEditor"
      Env        = var.environment
      Owner      = "DevTeam"
      CostCenter = "Engineering"
      ManagedBy  = "Terraform"
    }
  }
}

# Example module usage (for future SST consumption)
# See modules/ directory for available modules

# module "kms" {
#   source = "./modules/kms"
#
#   project     = "PhotoEditor"
#   environment = var.environment
#   description = "PhotoEditor ${var.environment} encryption key"
# }

# module "temp_bucket" {
#   source = "./modules/s3-bucket"
#
#   bucket_name        = "photoeditor-${var.environment}-temp-uploads"
#   lifecycle_days     = 2
#   versioning_enabled = false
#   kms_key_arn        = module.kms.key_arn
#   environment        = var.environment
# }
