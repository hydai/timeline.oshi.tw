import { notFound } from "next/navigation";
import { channelAliases, channelIdFromSlug, channelProfiles } from "@/lib/channel-aliases";
import { channelMetadata } from "@/lib/site";
import TimelinePage from "@/app/components/TimelinePage";

export const dynamicParams = false;

export function generateStaticParams() {
  return [...channelAliases.keys()].map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const channelId = channelIdFromSlug((await params).slug);
  if (!channelId) notFound();
  return channelMetadata(channelId);
}

export default async function ChannelAliasPage({ params }: Props) {
  const channelId = channelIdFromSlug((await params).slug);
  if (!channelId) notFound();
  return <TimelinePage name={channelProfiles[channelId]!.name} />;
}
