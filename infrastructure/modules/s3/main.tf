# S3 Buckets for Photo Editor Application

# Temporary bucket for uploaded images
resource "aws_s3_bucket" "temp" {
  bucket = var.temp_bucket_name

  tags = merge(var.tags, {
    Name        = var.temp_bucket_name
    Purpose     = "temporary-uploads"
    Environment = var.environment
  })
}

resource "aws_s3_bucket_public_access_block" "temp" {
  bucket = aws_s3_bucket.temp.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "temp" {
  bucket = aws_s3_bucket.temp.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "temp" {
  bucket = aws_s3_bucket.temp.id

  rule {
    id     = "temp_file_cleanup"
    status = "Enabled"

    filter {}

    expiration {
      days = var.temp_retention_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = var.abort_multipart_days
    }

    noncurrent_version_expiration {
      noncurrent_days = 1
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "temp" {
  bucket = aws_s3_bucket.temp.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "POST"]
    allowed_origins = ["*"] # Should be restricted to app domains in production
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# Final bucket for processed images
resource "aws_s3_bucket" "final" {
  bucket = var.final_bucket_name

  tags = merge(var.tags, {
    Name        = var.final_bucket_name
    Purpose     = "processed-images"
    Environment = var.environment
  })
}

resource "aws_s3_bucket_public_access_block" "final" {
  bucket = aws_s3_bucket.final.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "final" {
  bucket = aws_s3_bucket.final.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_id
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_versioning" "final" {
  bucket = aws_s3_bucket.final.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "final" {
  bucket = aws_s3_bucket.final.id

  rule {
    id     = "final_file_lifecycle"
    status = "Enabled"

    filter {}

    transition {
      days          = var.final_transition_days
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 90
      storage_class = "GLACIER_IR"
    }

    transition {
      days          = 365
      storage_class = "GLACIER"
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = var.abort_multipart_days
    }

    noncurrent_version_transition {
      noncurrent_days = 30
      storage_class   = "STANDARD_IA"
    }

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

# Server Access Logging (optional)
resource "aws_s3_bucket" "access_logs" {
  bucket = "${var.common_name}-access-logs-${var.account_id}"

  tags = merge(var.tags, {
    Name        = "${var.common_name}-access-logs"
    Purpose     = "access-logs"
    Environment = var.environment
  })
}

resource "aws_s3_bucket_public_access_block" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id

  rule {
    id     = "log_cleanup"
    status = "Enabled"

    filter {}

    expiration {
      days = 90
    }
  }
}

resource "aws_s3_bucket_logging" "temp" {
  bucket = aws_s3_bucket.temp.id

  target_bucket = aws_s3_bucket.access_logs.id
  target_prefix = "temp-bucket-logs/"
}

resource "aws_s3_bucket_logging" "final" {
  bucket = aws_s3_bucket.final.id

  target_bucket = aws_s3_bucket.access_logs.id
  target_prefix = "final-bucket-logs/"
}