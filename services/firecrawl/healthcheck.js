// Health check script using fetch
const checkHealth = async () => {
  try {
    const response = await fetch('http://localhost:3002/v0/health/readiness', {
      timeout: 2000,
    })

    if (!response.ok) {
      process.exit(1)
    }

    const data = await response.json()

    console.log(data)

    if (data.status === 'ok') {
      process.exit(0)
    } else {
      process.exit(1)
    }
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}

checkHealth()
