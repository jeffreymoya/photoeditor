# This file demonstrates versioned module sources
# In a real implementation, these would point to versioned releases from a module registry or Git tags

locals {
  # Module versions - these would typically come from a registry like:
  # "terraform-aws-modules/vpc/aws"
  # Or from git with version tags like:
  # "git::https://github.com/organization/terraform-modules.git//vpc?ref=v1.2.3"

  module_versions = {
    s3         = "v1.0.0"
    dynamodb   = "v1.0.0"
    sqs        = "v1.0.0"
    lambda     = "v1.0.0"
    api        = "v1.0.0"
    sns        = "v1.0.0"
    vpc        = "v1.0.0"
    kms        = "v1.0.0"
    budgets    = "v1.0.0"
    monitoring = "v1.0.0"
  }

  # In production, these would be external module sources:
  # s3_module_source       = "git::https://github.com/organization/terraform-modules.git//s3?ref=${local.module_versions.s3}"
  # dynamodb_module_source = "git::https://github.com/organization/terraform-modules.git//dynamodb?ref=${local.module_versions.dynamodb}"
  # etc.

  # For this demonstration, using local modules but showing the versioned pattern
  s3_module_source         = "./modules/s3"
  dynamodb_module_source   = "./modules/dynamodb"
  sqs_module_source        = "./modules/sqs"
  lambda_module_source     = "./modules/lambda"
  api_module_source        = "./modules/api-gateway"
  sns_module_source        = "./modules/sns"
  vpc_module_source        = "./modules/vpc"
  kms_module_source        = "./modules/kms"
  budgets_module_source    = "./modules/budgets"
  monitoring_module_source = "./modules/monitoring"
}