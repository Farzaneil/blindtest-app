// Point d'entrée explicite, nécessaire en monorepo : le fichier générique
// "expo/AppEntry" suppose que le paquet "expo" est installé directement dans
// node_modules de cette app (non hissé), et importe l'App via un chemin
// relatif ("../../App") qui casse dès que expo est hissé à la racine du
// monorepo (notre cas, avec les workspaces npm). En définissant notre propre
// point d'entrée local, l'import de "./App" reste toujours correct.
import { registerRootComponent } from "expo";
import App from "./App";

registerRootComponent(App);
