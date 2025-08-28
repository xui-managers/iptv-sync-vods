function updateProgress(current, total) {
  const percent = Math.floor((current / total) * 100);
  const barLength = 30; 
  const filledLength = Math.floor((percent / 100) * barLength);

  const bar = "█".repeat(filledLength) + "-".repeat(barLength - filledLength);

  process.stdout.write(
    `\r📦 Processando: [${bar}] ${percent}% (${current}/${total})`
  );

  if (current === total) {
    process.stdout.write("\n✔️ Concluído!\n");
  }
}


module.exports = updateProgress;