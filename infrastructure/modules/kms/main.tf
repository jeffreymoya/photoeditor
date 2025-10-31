/**
 * KMS Key Module
 *
 * Provisions customer-managed KMS keys with automatic rotation.
 *
 * Standards Compliance:
 * - cross-cutting.md L52: KMS encryption for S3, DynamoDB, SQS, SNS
 * - infrastructure-tier.md L7: Versioned modules with input/output contracts
 * - ADR-0008: Module reuse for SST/Terraform parity
 *
 * Version: 1.0.0
 */

resource "aws_kms_key" "this" {
  description              = var.description
  enable_key_rotation      = true
  deletion_window_in_days  = var.deletion_window_in_days
  customer_master_key_spec = "SYMMETRIC_DEFAULT"
  key_usage                = "ENCRYPT_DECRYPT"

  tags = merge(
    {
      Name        = "${var.project}-${var.environment}-kms-key"
      Project     = var.project
      Env         = var.environment
      Owner       = var.owner
      CostCenter  = var.cost_center
      ManagedBy   = "Terraform"
    },
    var.additional_tags
  )
}

resource "aws_kms_alias" "this" {
  name          = "alias/${var.project}-${var.environment}"
  target_key_id = aws_kms_key.this.key_id
}
