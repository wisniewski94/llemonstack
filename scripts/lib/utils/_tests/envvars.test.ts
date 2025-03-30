// TODO: convert to tests
// // Example usage
// const env: Record<string, string | undefined> = {
//   'HOME': '/home/user',
//   'APP_PORT': '3000',
//   'NODE_ENV': 'development',
//   // These are intentionally not defined
//   // "DB_HOST": undefined,
//   // "ERROR_VAR": undefined,
// }

// Test cases demonstrating all patterns
// try {
//   console.log(`
//     Simple variable: ${expandEnvVars('${HOME}', env)}
//     Default value: ${expandEnvVars('${DB_HOST:-localhost}', env)}
//     Alternate value: ${expandEnvVars('${APP_PORT:+custom-port}', env)}
//     Alternate (not set): ${expandEnvVars('${DB_HOST:+alternate}', env)}
//     Assignment: ${expandEnvVars('${DB_HOST:=localhost:${APP_PORT}}', env, true)}
//     After assignment: ${env.DB_HOST}

//     Nested variables: ${
//     expandEnvVars('${UNDEFINED:-${ALSO_UNDEFINED:-${APP_PORT}}}', env)
//   }
//   `)

//   // This will throw an error
//   console.log(expandEnvVars('${ERROR_VAR:?Must provide ERROR_VAR}', env))
// } catch (error) {
//   console.error(`Error caught: ${error.message}`)
// }
