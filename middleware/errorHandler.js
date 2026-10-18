/**
 * Centralized Error Handler Middleware
 * Returns consistent JSON error responses
 */
const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  const isProduction = process.env.NODE_ENV === 'production';
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    message = 'Resource not found';
    statusCode = 404;
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    message = 'A record with these details already exists.';
    statusCode = 400;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    message = isProduction
      ? 'Please check the submitted information.'
      : Object.values(err.errors).map(e => e.message).join(', ');
    statusCode = 400;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    message = 'Invalid token. Please log in again.';
    statusCode = 401;
  }

  if (err.name === 'TokenExpiredError') {
    message = 'Token has expired. Please log in again.';
    statusCode = 401;
  }

  if (isProduction && statusCode >= 500) {
    console.error('Request failed:', {
      method: req.method,
      path: req.originalUrl,
      error: err,
    });
  } else if (!isProduction) {
    console.error('Error:', err);
  }

  if (isProduction && statusCode >= 500) {
    message = 'An unexpected error occurred. Please try again later.';
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(!isProduction && { stack: err.stack })
  });
};

module.exports = errorHandler;
