export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const fields = {};
      for (const issue of result.error.issues) {
        fields[issue.path.join('.') || '_'] = issue.message;
      }
      return res.status(400).json({ error: 'VALIDATION', message: 'Invalid input', fields });
    }
    req.body = result.data;
    next();
  };
}
