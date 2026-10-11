import { StockPage } from "@/features/finance/components/stock-page";

export default async function Stock({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return <StockPage symbol={decodeURIComponent(symbol).toUpperCase()} />;
}
