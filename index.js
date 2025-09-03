import inquirer from "inquirer";
import chalk from "chalk";
import initializeMovies from "./movies.js";
import initializeSeries from "./series.js";
import initializeChannels from "./channels.js";

function showBanner() {
  console.log(chalk.greenBright(`
 __   __  __   __  ___          _______  __   __  __    _  _______ 
|  |_|  ||  | |  ||   |        |       ||  | |  ||  |  | ||       |
|       ||  | |  ||   |  ____  |  _____||  |_|  ||   |_| ||       |
|       ||  |_|  ||   | |____| | |_____ |       ||       ||       |
 |     | |       ||   |        |_____  ||_     _||  _    ||      _|
|   _   ||       ||   |         _____| |  |   |  | | |   ||     |_ 
|__| |__||_______||___|        |_______|  |___|  |_|  |__||_______|
  `));
  console.log(chalk.yellowBright("                  🟢 XUI-SYNC - Sincronizador 🟢\n"));
  console.log(chalk.yellowBright("                    🟢 www.xui-managers.site 🟢\n"));
  console.log(chalk.yellowBright("               🟢 http://github.com/xui-managers 🟢\n"));
}

async function mainMenu() {
  showBanner();

  const { escolha } = await inquirer.prompt([
    {
      type: "list",
      name: "escolha",
      message: "O que você deseja fazer?",
      choices: [
        { name: "📽️  Sincronizar filmes", value: "filmes" },
        { name: "📺  Sincronizar séries", value: "series" },
        { name: "📺  Deletar e sincronizar todos os canais", value: "channels" },
        { name: "❌  Fechar aplicação", value: "sair" }
      ]
    }
  ]);

  switch (escolha) {
    case "filmes":
      await initializeMovies();
      break;
    case "series":
      await initializeSeries();
      break;
    case "channels":
      await initializeChannels();
      break;
    case "sair":
      console.log("\n👋 Saindo da aplicação...\n");
      process.exit(0);
  }
}

mainMenu();
