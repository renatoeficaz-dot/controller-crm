import ManualView from "@/components/ManualView";

// Sem restrição por página: o manual é justamente pra quem ainda não sabe usar
// o sistema — bloquear o acesso a ele seria contraproducente.
export default function AprenderPage() {
  return <ManualView />;
}
