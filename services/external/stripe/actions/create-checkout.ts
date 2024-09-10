"use server";

import { type UserId, db, supabaseUserMappings, users } from "@/drizzle";
import type { User } from "@supabase/auth-js";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import type Stripe from "stripe";
import { stripe } from "../config";
import { createOrRetrieveCustomer } from "./create-or-retrieve-customer";

export const createCheckoutBySupabaseUser = async (user: User) => {
	console.log(user.id);
	const [dbUser] = await db
		.select({ id: users.id })
		.from(users)
		.innerJoin(
			supabaseUserMappings,
			eq(users.dbId, supabaseUserMappings.userDbId),
		)
		.where(eq(supabaseUserMappings.supabaseUserId, user.id));
	if (user.email == null) {
		throw new Error("user.email is null");
	}
	return await createCheckout(dbUser.id, user.email);
};
export const createCheckout = async (userId: UserId, userEmail: string) => {
	const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
	if (siteUrl == null) {
		throw new Error("siteUrl is null");
	}
	const customer = await createOrRetrieveCustomer(userId, userEmail);
	const checkoutSession: Stripe.Checkout.Session =
		await stripe.checkout.sessions.create({
			mode: "subscription",
			line_items: [
				{
					price: "price_1Pvwvk2MBZMnjD8tWOMzkt4O",
					quantity: 1,
				},
			],
			customer,
			customer_update: {
				address: "auto",
			},
			success_url: `${siteUrl}/agents`,
			cancel_url: `${siteUrl}/pricing`,
		});
	if (checkoutSession.url == null) {
		throw new Error("checkoutSession.url is null");
	}
	return checkoutSession;
};
