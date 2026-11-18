import { LevelGame } from "../../_components/LevelGame";

/** Un niveau (ou le boss) du mode solo : /solo/boum/3. */
export default async function SoloLevelPage({ params }: { params: Promise<{ world: string; level: string }> }) {
  const { world, level } = await params;
  return <LevelGame worldId={world} levelIndex={Number(level)} />;
}
