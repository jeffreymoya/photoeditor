/**
 * Artillery processor for presign/status performance tests
 * Provides helper functions for dynamic test data generation
 */

module.exports = {
  /**
   * Generate a random job ID for testing
   */
  generateJobId: function(context, events, done) {
    context.vars.jobId = `test-job-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    return done();
  },

  /**
   * Log response for debugging
   */
  logResponse: function(requestParams, response, context, ee, next) {
    if (response.statusCode !== 200) {
      console.log('Non-200 response:', response.statusCode, response.body);
    }
    return next();
  }
};
