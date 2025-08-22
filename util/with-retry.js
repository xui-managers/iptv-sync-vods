async function withRetry(operation, maxRetries = 3, delay = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      if (attempt === maxRetries) throw error

      const isTimeout = error.code === "ECONNABORTED" || error.message.includes("timeout")
      const shouldRetry =
        isTimeout || (error.response && [408, 429, 500, 502, 503, 504].includes(error.response.status))

      if (!shouldRetry) throw error

      console.log(`🔄 Attempt ${attempt} failed, retrying in ${delay / 1000} seconds...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

module.exports = withRetry;