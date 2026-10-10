/** Shared live state, kept up to date by plugins/mesh-stream.client.ts. */
export function useMesh() {
  const nodes = useState<MeshNode[]>('mesh-nodes', () => [])
  const packets = useState<MeshPacket[]>('mesh-packets', () => [])
  const links = useState<MeshLink[]>('mesh-links', () => [])
  const connected = useState('mesh-connected', () => false)

  function upsertNode(node: MeshNode) {
    const i = nodes.value.findIndex(n => n.num === node.num)
    if (i === -1) nodes.value.push(node)
    else nodes.value[i] = node
  }

  function upsertLink(link: MeshLink) {
    const i = links.value.findIndex(l => l.fromNum === link.fromNum && l.toNum === link.toNum)
    if (i === -1) links.value.push(link)
    else links.value[i] = link
  }

  return { nodes, packets, links, connected, upsertNode, upsertLink }
}

/** A clock that ticks every 30s so "x min ago" labels stay fresh. */
export function useNow() {
  const now = useState('mesh-now', () => Date.now())
  if (import.meta.client && !(window as any).__meshTicker) {
    (window as any).__meshTicker = setInterval(() => (now.value = Date.now()), 30_000)
  }
  return now
}
