import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import videoRouter from "./video.js";
import authRouter from "./auth.js";
import feedbackRouter from "./feedback.js";
import errorLogRouter from "./error-log.js";
import adminRouter from "./vidsnap-admin.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(videoRouter);
router.use(authRouter);
router.use(feedbackRouter);
router.use(errorLogRouter);
router.use(adminRouter);

export default router;

