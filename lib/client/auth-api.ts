import {
  apiRequest
} from "@/lib/client/api-client";


export async function logoutSession():
Promise<void> {
  await apiRequest<unknown>(
    "/api/auth/logout",
    {
      method:
        "POST"
    }
  );
}