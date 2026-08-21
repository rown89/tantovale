import { createRouter } from '../../lib/create-app';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { authPath } from '../../utils/constants';

export const userRoute = createRouter().get(`/${authPath}`, authMiddleware, async (c) => {
	const user = c.var.user;

	try {
		if (user) {
			return c.json(user, 200);
		} else {
			return c.json(
				{
					message: 'User not found',
				},
				404,
			);
		}
	} catch (error) {
		return c.json(
			{
				message: 'user route error',
			},
			500,
		);
	}
});
