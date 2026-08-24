// Só STUN público (Google) — ajuda os dois lados a descobrirem seu endereço
// através do NAT, a mídia em si nunca passa por aqui. Funciona bem na
// maioria das redes (wifi doméstico, 4G/5G); em redes bem restritas (wifi
// corporativo, NAT simétrico) a conexão pode falhar sem um TURN próprio —
// decisão consciente de começar simples e só adicionar TURN se isso
// aparecer na prática.
export const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];
