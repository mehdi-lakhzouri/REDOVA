'use client';

import { ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ShowcaseSection } from './showcase-section';

const findings = [
  {
    id: 'fnd_0192',
    title: 'Prompt injection via tool output',
    status: 'Open',
    variant: 'destructive',
  },
  { id: 'fnd_0187', title: 'Excessive tool permissions', status: 'In review', variant: 'warning' },
  { id: 'fnd_0171', title: 'Memory poisoning', status: 'Resolved', variant: 'success' },
] as const;

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">{children}</CardContent>
    </Card>
  );
}

export function ComponentsSection() {
  return (
    <ShowcaseSection
      id="components"
      area="components / shadcn base-ui"
      title="Components"
      description="The existing shadcn/ui library on the REDOVA tokens. Red marks the single primary action of a view; every state keeps a visible focus ring."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Button">
          <Button>Run assessment</Button>
          <Button variant="secondary">Export report</Button>
          <Button variant="outline">Cancel</Button>
          <Button variant="ghost">View logs</Button>
          <Button variant="destructive">Revoke access</Button>
          <Button disabled>Disabled</Button>
        </Panel>

        <Panel title="Badge">
          <Badge>Critical</Badge>
          <Badge variant="destructive">Open</Badge>
          <Badge variant="warning">In review</Badge>
          <Badge variant="success">Resolved</Badge>
          <Badge variant="info">Scheduled</Badge>
          <Badge variant="outline">Draft</Badge>
        </Panel>

        <Panel title="Input, checkbox, switch">
          <div className="grid w-full gap-4">
            <div className="grid gap-2">
              <Label htmlFor="agent-name">Agent name</Label>
              <Input id="agent-name" placeholder="Customer support agent" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="agent-invalid">Endpoint URL</Label>
              <Input id="agent-invalid" defaultValue="http:/agent" aria-invalid />
              <p className="text-xs text-destructive">Enter a valid HTTPS URL.</p>
            </div>
            <div className="flex flex-wrap gap-6">
              <Label className="flex items-center gap-2">
                <Checkbox defaultChecked /> Notify on critical findings
              </Label>
              <Label className="flex items-center gap-2">
                <Switch defaultChecked /> Scheduled runs
              </Label>
            </div>
          </div>
        </Panel>

        <Panel title="Tabs, tooltip, toast">
          <Tabs defaultValue="findings" className="w-full">
            <TabsList>
              <TabsTrigger value="findings">Findings</TabsTrigger>
              <TabsTrigger value="evidence">Evidence</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
            </TabsList>
            <TabsContent value="findings" className="pt-3 text-sm text-muted-foreground">
              3 findings across 2 agents.
            </TabsContent>
            <TabsContent value="evidence" className="pt-3 text-sm text-muted-foreground">
              Evidence is attached to each finding.
            </TabsContent>
            <TabsContent value="logs" className="type-technical pt-3 text-xs text-muted-foreground">
              [INFO] exe_7f3c9a1e completed in 41.2s
            </TabsContent>
          </Tabs>
          <Tooltip>
            <TooltipTrigger render={<Button variant="outline" size="sm" />}>
              Hover me
            </TooltipTrigger>
            <TooltipContent>Tooltips use the popover surface.</TooltipContent>
          </Tooltip>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              toast.success('Assessment scheduled', { description: 'asm_2026_11_01_0042' })
            }
          >
            Show toast
          </Button>
        </Panel>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Table</CardTitle>
            <CardDescription>
              Identifiers use Geist Mono; status uses badges, never color alone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Finding</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {findings.map((finding) => (
                  <TableRow key={finding.id}>
                    <TableCell className="type-technical text-xs text-muted-foreground">
                      {finding.id}
                    </TableCell>
                    <TableCell>{finding.title}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={finding.variant}>{finding.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Alert variant="destructive">
          <ShieldAlert aria-hidden />
          <AlertTitle>Critical finding detected</AlertTitle>
          <AlertDescription>
            The agent executed a tool call from untrusted retrieved content.
          </AlertDescription>
        </Alert>

        <Panel title="Skeleton">
          <div className="grid w-full gap-2" aria-hidden>
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </Panel>
      </div>
    </ShowcaseSection>
  );
}
