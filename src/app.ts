import express from 'express';
import cors from 'cors'
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { errorHandler } from './middleware/errorHandler';
import routes from './routes/index';

const app = express();
app.use(cors())
app.options('*', cors());

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use('/api', routes);

app.use(errorHandler);

export default app;
