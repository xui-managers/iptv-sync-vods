import mysql from 'mysql2/promise'
import readline from 'readline'
import dotenv from 'dotenv';
import inquirer from "inquirer";

dotenv.config();

// --- CONFIGURAÇÕES
const {
  DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
} = process.env;


const connection = await mysql.createConnection({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME
});

const tipos = {
  1: "channels",
  2: "movies",
  4: "radios",
  5: "series"
};

export async function initializeReset() {
  try {
    // Menu interativo
    const { tipo } = await inquirer.prompt([
      {
        type: "list",
        name: "tipo",
        message: "\n\n\n[USE COM ATENÇÃO] FUNÇÃO DESTRUTIVA!!!!!\n\nSelecione o tipo de registros que deseja deletar:",
        choices: [
          { name: "📺 Channels", value: 1 },
          { name: "🎬 Movies", value: 2 },
          { name: "📻 Radios", value: 4 },
          { name: "📂 Series", value: 5 },
          { name: "📂 !!TUDO!!", value: 9 }
        ]
      }
    ]);

    console.log(`🗑️  Deletando registros do tipo ${tipos[tipo]}...`);

    // Deletar da tabela principal
    await connection.query("DELETE FROM streams WHERE type = ?", [tipo]);
    if(tipo === 1) {
      await connection.query("DELETE FROM streams_categories WHERE type = 'live'");
    } else if(tipo === 2) {
      await connection.query("DELETE FROM streams_categories WHERE type = 'movie'");
    } else if(tipo === 4) {
      await connection.query("DELETE FROM streams_categories WHERE type = 'radio'");
    }

    // Se for series, também limpar as tabelas relacionadas
    if (tipo === 5) {
      await connection.query("DELETE FROM streams_series");
      await connection.query("ALTER TABLE streams_series AUTO_INCREMENT = 1");
      await connection.query("DELETE FROM streams_episodes");
      await connection.query("ALTER TABLE streams_episodes AUTO_INCREMENT = 1");
      await connection.query("DELETE FROM streams_categories WHERE type = 'series'");
    } else if(tipo === 9) {
      await connection.query("DELETE FROM streams");
      await connection.query("ALTER TABLE streams AUTO_INCREMENT = 1");
      //series
      await connection.query("DELETE FROM streams_series");
      await connection.query("ALTER TABLE streams_series AUTO_INCREMENT = 1");
      await connection.query("DELETE FROM streams_episodes");
      await connection.query("ALTER TABLE streams_episodes AUTO_INCREMENT = 1");
      await connection.query("DELETE FROM streams_categories WHERE id is NOT NULL");
    }

    console.log(`✅ Registros de ${tipos[tipo]} deletados com sucesso!`);
  } catch (err) {
    console.error("❌ Erro ao deletar:", err);
  } finally {
    await connection.end();
  }
}

initializeReset();