async function withRetry(operation, initialDelay = 60000, maxDelay = 600000) {
  let attempt = 1
  let delay = initialDelay

  while (true) {
    try {
      return await operation()
    } catch (error) {
      const isTimeout =
        error.code === "ECONNABORTED" || error.message?.includes("timeout")

      const shouldRetry =
        isTimeout ||
        (error.response &&
          [408, 429, 500, 502, 503, 504].includes(error.response.status))

      if (!shouldRetry) throw error

        process.stdout.write(
          `\r🔄 Attempt ${attempt} failed, retrying in ${delay / 1000} seconds...`
        );

      await new Promise((resolve) => setTimeout(resolve, delay))

      attempt++
      delay = Math.min(delay + 60000, maxDelay)
    }
  }
}

module.exports = withRetry