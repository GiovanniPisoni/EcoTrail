const REQUIRED = ['MONGODB_URI', 'JWT_SECRET', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']

const EXAMPLE_VALUES = ['your_jwt_secret_key', 'your_vapid_public_key', 'your_vapid_private_key']

export function findProductionEnvProblems(env = process.env) {
  const problems = REQUIRED.filter((name) => !env[name]).map((name) => `${name} is not set`)

  for (const name of REQUIRED) {
    if (EXAMPLE_VALUES.includes(env[name])) {
      problems.push(`${name} still has the value from .env.example`)
    }
  }

  return problems
}
