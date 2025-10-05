Feature: PhotoEditor E2E on LocalStack
  End-to-end flow from presign to processed image using LocalStack.

  Background:
    Given LocalStack is running on http://localhost:4566
    And Terraform has applied with var-file "terraform.tfvars.localstack"
    And the API base URL is read from Terraform output "api_gateway_url"
    And AWS CLI is configured with:
      | AWS_ENDPOINT_URL        | http://localhost:4566 |
      | AWS_ACCESS_KEY_ID       | test                  |
      | AWS_SECRET_ACCESS_KEY   | test                  |
      | AWS_DEFAULT_REGION      | us-east-1             |

  @single @happy_path
  Scenario: Single image upload is processed to completion
    When I request a presigned upload for:
      | fileName    | sample.jpg     |
      | contentType | image/jpeg     |
      | fileSize    | 1024           |
      | prompt      | enhance colors |
    Then I receive a JSON response with fields "jobId", "presignedUrl", "s3Key", and "expiresAt"
    When I upload a valid JPEG image to the returned "presignedUrl"
    Then the job status becomes "PROCESSING" within 10 seconds via GET /status/{jobId}
    And the job status becomes "COMPLETED" within 120 seconds via GET /status/{jobId}
    And the final object for the job exists in the final S3 bucket
    And the SQS dead-letter queue has 0 messages

  @api @status
  Scenario: Status endpoint with path parameter
    Given a valid existing jobId
    When I GET /status/{jobId}
    Then the response status is 200
    And the JSON contains "jobId", "status", "createdAt", and "updatedAt"

  @wiring @events
  Scenario: S3 ObjectCreated events enqueue SQS and trigger worker
    Given a job exists with status "QUEUED"
    And I upload an object under the temp prefix for that job
    Then an S3 ObjectCreated event is delivered to the processing SQS queue
    And the worker Lambda is invoked via SQS event source mapping
    And the job status transitions to "PROCESSING" and then to "COMPLETED"

  @batch
  Scenario: Batch upload processes all images and marks batch as complete
    When I request batch presigned uploads for 2 images with a shared prompt
    Then I receive a JSON response with fields "batchJobId", "uploads" (2 items), and "childJobIds" (2 items)
    When I upload both images to their respective presigned URLs
    Then each child job status becomes "COMPLETED" within 180 seconds
    And the batch job progress reaches completedCount=2/totalCount=2
    And the batch job status is "COMPLETED"

  @negative @validation
  Scenario: Presign rejects unsupported content type
    When I request a presigned upload with contentType "image/gif"
    Then the response status is 400
    And the error message indicates an invalid contentType

  @resilience @fallback
  Scenario: Editing provider failure falls back to original copy
    Given the editing provider returns an error for a specific image
    When I upload that image to the temp bucket via presigned URL
    Then the worker copies the original image to the final bucket
    And the job status becomes "COMPLETED"
