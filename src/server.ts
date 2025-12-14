import { env } from './config/env';
import app from './app';

app.listen(env.port, () => {
  console.log(`Server started on port ${env.port}`);
});
