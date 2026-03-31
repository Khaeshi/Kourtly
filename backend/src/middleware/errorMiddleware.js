const notFound = (req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    res.status(404);
    next(error);
  };
  
  const errorHandler = (err, req, res, next) => {
    // Determine the status code. If the error already has a status code, use it. Otherwise, default to 500 (Internal Server Error).
    let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    let message = err.message;
  
    // You can add custom error handling for specific error types, like Mongoose's CastError for invalid ObjectIds.
    if (err.name === 'CastError' && err.kind === 'ObjectId') {
      statusCode = 404;
      message = 'Resource not found';
    }
  
    res.status(statusCode).json({
      message: message,
      // In development mode, you might want to include the error stack for debugging purposes.
      // Avoid sending the stack trace in production as it can expose sensitive information.
      stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
  };
  
  export { notFound, errorHandler };