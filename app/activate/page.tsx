import ActivateClient from "./activate-client";

type PageProps = {
  searchParams: Promise<{
    token?: string;
  }>;
};

export default async function ActivatePage({
  searchParams
}: PageProps) {
  const params = await searchParams;

  return (
    <ActivateClient
      token={params.token ?? ""}
    />
  );
}