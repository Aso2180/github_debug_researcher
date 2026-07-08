import basicAuth from 'express-basic-auth';
import { DASHBOARD_USER, DASHBOARD_PASSWORD } from '../config.js';

export const authMiddleware = basicAuth({
  users: { [DASHBOARD_USER]: DASHBOARD_PASSWORD },
  challenge: true,
  realm: 'tech-stack-analyzer',
});
