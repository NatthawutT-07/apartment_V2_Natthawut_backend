import "dotenv/config";
import { app } from "./app.js";
import { getDatabaseUrl, getJwtSecret } from "./config/env.js";

getDatabaseUrl();
getJwtSecret();

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

