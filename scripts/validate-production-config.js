const { validateProductionConfig } = require("../src/config/production");

function validate(env = process.env) {
  return validateProductionConfig(env);
}

if (require.main === module) {
  try {
    console.log(JSON.stringify({ status: "valid", ...validate() }));
  } catch (error) {
    console.error(JSON.stringify({ status: "invalid", error: error.code, details: error.details }));
    process.exitCode = 1;
  }
}

module.exports = { validate };
