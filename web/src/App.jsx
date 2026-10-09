import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

// Phase 0 placeholder: confirms React, Tailwind, shadcn/ui, the bundled font and theme tokens.
export default function App() {
  return (
    <main className="flex h-full items-center justify-center">
      <Card className="w-80">
        <CardHeader>
          <CardTitle>LSPB ready</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Badge className="bg-lspb-ok text-background">OK</Badge>
          <Badge className="bg-lspb-warn text-background">WARN</Badge>
          <Badge className="bg-lspb-bad text-background">BAD</Badge>
          <Badge className="bg-lspb-sun text-background">SUN</Badge>
          <Badge className="bg-lspb-earth text-background">EARTH</Badge>
        </CardContent>
      </Card>
    </main>
  )
}
