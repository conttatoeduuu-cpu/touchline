import Link from 'next/link';
import Image from 'next/image';

export default function Home() {
  return <main className="portal"><div className="wordmark">TOUCHLINE<span>CLUB INTELLIGENCE</span></div><div className="portal-heading"><p className="eyebrow">DOIS CLUBES. DUAS HISTÓRIAS.</p><h1>Seu próximo nível<br/>começa aqui.</h1><p>Escolha o ambiente da sua equipe.</p></div><div className="club-choices"><Link className="club-choice dtr" href="/dtr"><div className="monogram"><Image src="/teams/dtr.png" alt="Escudo DTR Esports" width={155} height={155}/><span>01</span></div><p>PERFORMANCE CENTER</p><h2>DTR Esports <span aria-hidden="true">↗</span></h2><small>Acesso exclusivo da equipe</small></Link><Link className="club-choice vortex" href="/vortex"><div className="monogram"><Image src="/teams/vortex.png" alt="Escudo Vortex EC" width={155} height={155}/><span>02</span></div><p>PERFORMANCE CENTER</p><h2>Vortex EC <span aria-hidden="true">↗</span></h2><small>Acesso exclusivo da equipe</small></Link></div><footer>EA SPORTS FC · CLUBS <span>Ambientes independentes. Dados privados.</span></footer></main>
}
