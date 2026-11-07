/**
 * Our own texts, plain on purpose: a hard word or an odd name measures the
 * passage, not the reader. The RSVP round continues where the read round ends.
 */
export interface SpeedTestPassage {
	id: string;
	read: string[];
	rsvp: string;
}

export const SPEED_TEST_PASSAGES: readonly [SpeedTestPassage, ...SpeedTestPassage[]] = [
	{
		id: "canal-1",
		read: [
			"The canal ran straight through the town, and most mornings it was the first thing Mara saw from her window. In summer the water turned green and slow, and ducks drifted along it as if they had nowhere to be. In winter a thin skin of ice formed near the banks, and children threw pebbles to hear them skip and click across the surface.",
			"Her grandfather had worked on the boats that once carried coal and grain along this water. He liked to say that the canal was older than every house that faced it, and that the town had grown up around it the way moss grows around a stone. Mara had never quite believed him until she found an old map in a drawer, the paper soft as cloth, with the canal drawn in blue ink and only a handful of buildings beside it.",
			"Now the boats were gone, and the towpath belonged to runners and dog walkers. Mara walked it every evening after work. She counted the bridges as she passed them, seven in all, each built in a different century and each a little lower than the one before. At the last bridge she always stopped, leaned on the cold railing, and watched the light fade from the water before she turned back home.",
		],
		rsvp: "One evening she kept walking. Past the seventh bridge the path grew narrow and the houses fell away, and the canal bent toward a line of willow trees she had never noticed. The water there was clearer, and she could see the stones on the bottom. She followed it until the sky was nearly dark, and at the end, where the canal met the river, she found a small wooden boat tied to a post, its name painted by hand on the side. It was her grandfather's name. Mara stood there a long time, listening to the water, and then she walked home slowly, already planning to come back in the morning.",
	},
	{
		id: "orchard-1",
		read: [
			"Every autumn the orchard on the hill behind the school filled with people who claimed they had only come for a walk. They carried baskets anyway. The trees were old and crooked, planted by a farmer whose name nobody remembered, and they gave more apples than anyone could possibly eat. Some years the branches bent so low that the fruit touched the grass.",
			"Jonas went up on the first cool Saturday of the season with his sister and an empty backpack. The path was muddy from the night's rain, and the air smelled of wet leaves and something sweet that was almost like cider. Halfway up they met their neighbour, who was coming down with two full bags and a satisfied look, and who told them that the best trees were at the very top, near the broken fence.",
			"They climbed on. At the top the wind was stronger and the town spread out below them, roofs and gardens and the long grey line of the railway. Jonas filled his backpack while his sister ate one apple after another and gave each of them a score out of ten. By the time they turned to go, the sun was already low and the shadows of the trees stretched far across the slope.",
		],
		rsvp: "On the way down they took a different path, one that wound between the oldest trees. Near the bottom they found a wooden sign half hidden in the grass. Someone had carved a short message into it long ago: take what you need, and plant one seed for the next person. His sister read it twice. Then she picked a seed out of the apple in her hand, pressed it into the soft earth beside the sign, and covered it carefully with her shoe. Jonas laughed at her, but the next spring he went back alone to see whether anything had grown, and he kept going back every spring after that.",
	},
];

export function pickPassage(lastPassageId: string | null | undefined): SpeedTestPassage {
	const others = SPEED_TEST_PASSAGES.filter((p) => p.id !== lastPassageId);
	const pool = others.length > 0 ? others : SPEED_TEST_PASSAGES;
	return pool[Math.floor(Math.random() * pool.length)] ?? SPEED_TEST_PASSAGES[0];
}
