import { wordPos } from "@lesefluss/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	type GoalParams,
	type GoalPlanInput,
	type GoalSession,
	newGoalPlanFields,
	planReadingGoal,
	type ReadingGoalPlan,
	replanGoal,
} from "../reading-goal";

const ORIGINAL_TZ = process.env.TZ;
const MINUTE = 60_000;
const WORDS = 1000;

beforeAll(() => {
	// Springs forward on 29 March 2026.
	process.env.TZ = "Europe/Berlin";
});
afterAll(() => {
	process.env.TZ = ORIGINAL_TZ;
});

/** Local wall-clock time in the test zone. */
function at(date: string, time = "12:00"): number {
	const [y, m, d] = date.split("-").map(Number);
	const [h, min] = time.split(":").map(Number);
	return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1, h ?? 0, min ?? 0).getTime();
}

function session(date: string, time: string, startWord: number, endWord: number): GoalSession {
	const endedAt = at(date, time);
	return {
		startedAt: endedAt - 20 * MINUTE,
		endedAt,
		startWord,
		endWord,
		wordsRead: endWord - startWord,
	};
}

function deadlineGoal(targetDate: string, created = at("2026-03-01", "10:00"), startWord = 0) {
	return {
		...newGoalPlanFields({ mode: "deadline", targetDate }, startWord, WORDS, created),
		status: "active",
		startedAt: created,
		startWord: wordPos(startWord),
		completedAt: null,
	} satisfies GoalParams;
}

function paceGoal(dailyPercent: number, created = at("2026-03-01", "10:00"), startWord = 0) {
	return {
		...newGoalPlanFields({ mode: "pace", dailyPercent }, startWord, WORDS, created),
		status: "active",
		startedAt: created,
		startWord: wordPos(startWord),
		completedAt: null,
	} satisfies GoalParams;
}

function input(goal: GoalParams, overrides: Partial<GoalPlanInput> = {}): GoalPlanInput {
	return {
		goal,
		book: { wordCount: WORDS, wordPosition: goal.startWord },
		sessions: [],
		bookWpm: null,
		globalWpm: null,
		now: at("2026-03-01", "12:00"),
		...overrides,
	};
}

function plan(i: GoalPlanInput): ReadingGoalPlan {
	const result = planReadingGoal(i);
	if (result.kind !== "plan") throw new Error("expected a plan");
	return result;
}

describe("newGoalPlanFields", () => {
	it("derives a deadline goal's equivalent daily percent", () => {
		const fields = newGoalPlanFields(
			{ mode: "deadline", targetDate: "2026-03-10" },
			0,
			WORDS,
			at("2026-03-01"),
		);
		expect(fields).toMatchObject({ planStartDate: "2026-03-01", dailyPercent: 10 });
	});

	it("derives a pace goal's implied finish date", () => {
		const fields = newGoalPlanFields(
			{ mode: "pace", dailyPercent: 0.55 },
			0,
			WORDS,
			at("2026-03-01"),
		);
		// 100 / 0.55 = 181.8, so 182 days including the first.
		expect(fields.targetDate).toBe("2026-08-29");
	});
});

describe("today's target", () => {
	it("splits the remaining book over the days left, in percent and minutes", () => {
		const p = plan(input(deadlineGoal("2026-03-10")));
		expect(p.dailyTarget.words).toBe(100);
		expect(p.dailyTarget.percent).toBeCloseTo(10);
		expect(p.dailyTarget.minutes).toBeCloseTo(100 / 225);
		expect(p.pace).toEqual({ wpm: 225, isMeasured: false });
	});

	it("prefers this book's speed, then the global measured speed", () => {
		const goal = deadlineGoal("2026-03-10");
		expect(plan(input(goal, { bookWpm: 200, globalWpm: 300 })).dailyTarget.minutes).toBeCloseTo(
			0.5,
		);
		expect(plan(input(goal, { globalWpm: 250 })).dailyTarget.minutes).toBeCloseTo(0.4);
	});

	it("does not change while reading during the same day", () => {
		const goal = deadlineGoal("2026-03-10");
		const morning = plan(
			input(goal, {
				now: at("2026-03-03", "08:00"),
				sessions: [session("2026-03-02", "20:00", 0, 100)],
				book: { wordCount: WORDS, wordPosition: 100 },
			}),
		);
		const evening = plan(
			input(goal, {
				now: at("2026-03-03", "23:30"),
				sessions: [
					session("2026-03-02", "20:00", 0, 100),
					session("2026-03-03", "09:00", 100, 150),
					session("2026-03-03", "23:00", 150, 260),
				],
				book: { wordCount: WORDS, wordPosition: 260 },
			}),
		);
		expect(evening.dailyTarget).toEqual(morning.dailyTarget);
		expect(evening.dayStartWord).toBe(100);
		expect(evening.progressToday.words).toBe(160);
	});

	it("is fixed by a session that runs across midnight at its start position", () => {
		const goal = deadlineGoal("2026-03-10");
		const spanning: GoalSession = {
			startedAt: at("2026-03-02", "23:40"),
			endedAt: at("2026-03-03", "00:20"),
			startWord: 100,
			endWord: 180,
			wordsRead: 80,
		};
		const p = plan(
			input(goal, {
				now: at("2026-03-03", "00:25"),
				sessions: [session("2026-03-02", "20:00", 0, 100), spanning],
				book: { wordCount: WORDS, wordPosition: 180 },
			}),
		);
		expect(p.dayStartWord).toBe(100);
		expect(p.progressToday.words).toBe(80);
	});

	it("credits a session ending one minute before midnight to that day", () => {
		const goal = deadlineGoal("2026-03-10");
		const p = plan(
			input(goal, {
				now: at("2026-03-02", "00:01"),
				sessions: [session("2026-03-01", "23:59", 0, 120)],
				book: { wordCount: WORDS, wordPosition: 120 },
			}),
		);
		expect(p.today).toBe("2026-03-02");
		expect(p.dayStartWord).toBe(120);
		expect(p.progressToday.words).toBe(0);
		expect(p.daysTargetMet).toBe(1);
	});
});

describe("deadline mode", () => {
	it("raises the following days' target after a missed day", () => {
		const goal = deadlineGoal("2026-03-10");
		const p = plan(input(goal, { now: at("2026-03-02") }));
		// 1000 words over the 9 days left.
		expect(p.dailyTarget.words).toBe(112);
		expect(p.projectedFinishDate).toBe("2026-03-10");
		expect(p.daysLeft).toBe(9);
	});

	it("still finishes on the target date when every raised target is met", () => {
		const goal = deadlineGoal("2026-03-10");
		const sessions: GoalSession[] = [];
		let position = 0;
		for (let day = 2; day <= 10; day++) {
			const date = `2026-03-${String(day).padStart(2, "0")}`;
			const p = plan(
				input(goal, {
					now: at(date, "08:00"),
					sessions,
					book: { wordCount: WORDS, wordPosition: wordPos(position) },
				}),
			);
			const end = position + p.dailyTarget.words;
			sessions.push(session(date, "20:00", position, end));
			position = end;
		}
		expect(position).toBe(WORDS);
	});

	it("puts everything left on a target date of today", () => {
		const goal = deadlineGoal("2026-03-01");
		const p = plan(input(goal));
		expect(p.dailyTarget.words).toBe(WORDS);
		expect(p.daysLeft).toBe(1);
	});

	it("puts everything left on today once the target date has passed", () => {
		const goal = deadlineGoal("2026-03-03");
		const p = plan(
			input(goal, {
				now: at("2026-03-05"),
				sessions: [session("2026-03-01", "20:00", 0, 300)],
				book: { wordCount: WORDS, wordPosition: 300 },
			}),
		);
		expect(p.dailyTarget.words).toBe(700);
		expect(p.projectedFinishDate).toBe("2026-03-05");
		expect(p.aheadBehind.percent).toBeCloseTo(-70);
	});
});

describe("pace mode", () => {
	it("keeps the daily target and moves the finish date after a missed day", () => {
		const goal = paceGoal(10);
		expect(goal.targetDate).toBe("2026-03-10");
		const p = plan(input(goal, { now: at("2026-03-02") }));
		expect(p.dailyTarget.words).toBe(100);
		expect(p.projectedFinishDate).toBe("2026-03-11");
		expect(p.targetDate).toBe("2026-03-10");
	});

	it("pulls the finish date in when today's target is beaten", () => {
		const goal = paceGoal(10);
		const p = plan(
			input(goal, {
				sessions: [session("2026-03-01", "11:00", 0, 300)],
				book: { wordCount: WORDS, wordPosition: 300 },
			}),
		);
		// 700 left at 100 a day, starting tomorrow.
		expect(p.projectedFinishDate).toBe("2026-03-08");
	});

	it("caps the last day's target at what is left", () => {
		const goal = paceGoal(30);
		const p = plan(
			input(goal, {
				now: at("2026-03-04"),
				sessions: [session("2026-03-03", "20:00", 0, 900)],
				book: { wordCount: WORDS, wordPosition: 900 },
			}),
		);
		expect(p.dailyTarget.words).toBe(100);
	});
});

describe("ahead and behind", () => {
	it("is zero for an on-pace reader who has not read yet today", () => {
		const goal = deadlineGoal("2026-03-10");
		const p = plan(
			input(goal, {
				now: at("2026-03-02", "08:00"),
				sessions: [session("2026-03-01", "20:00", 0, 100)],
				book: { wordCount: WORDS, wordPosition: 100 },
			}),
		);
		expect(p.aheadBehind).toEqual({ words: 0, percent: 0, days: 0 });
	});

	it("reports a missed day as behind against the original line, in percent and days", () => {
		const goal = deadlineGoal("2026-03-10");
		const p = plan(input(goal, { now: at("2026-03-02") }));
		expect(p.aheadBehind.percent).toBeCloseTo(-10);
		expect(p.aheadBehind.days).toBeCloseTo(-1);
	});

	it("credits reading past today's target as ahead", () => {
		const goal = deadlineGoal("2026-03-10");
		const p = plan(
			input(goal, {
				sessions: [session("2026-03-01", "11:00", 0, 250)],
				book: { wordCount: WORDS, wordPosition: 250 },
			}),
		);
		expect(p.isTodayMet).toBe(true);
		expect(p.progressToday.percent).toBeCloseTo(25);
		expect(p.isTodayMet).toBe(true);
		expect(p.aheadBehind.percent).toBeCloseTo(15);
		expect(p.aheadBehind.days).toBeCloseTo(1.5);
	});

	it("lowers the next deadline target after reading ahead", () => {
		const goal = deadlineGoal("2026-03-10");
		const p = plan(
			input(goal, {
				now: at("2026-03-02"),
				sessions: [session("2026-03-01", "11:00", 0, 250)],
				book: { wordCount: WORDS, wordPosition: 250 },
			}),
		);
		expect(p.dailyTarget.words).toBe(84);
	});
});

describe("completion", () => {
	it("uses the unrounded finished rule, the same one the database applies", () => {
		const goal = deadlineGoal("2026-03-10");
		const at945 = plan(input(goal, { book: { wordCount: WORDS, wordPosition: wordPos(945) } }));
		const at949 = plan(input(goal, { book: { wordCount: WORDS, wordPosition: wordPos(949) } }));
		expect(at945.isComplete).toBe(false);
		expect(at949.isComplete).toBe(false);
		expect(
			plan(input(goal, { book: { wordCount: WORDS, wordPosition: wordPos(950) } })).isComplete,
		).toBe(true);
	});

	it("credits the day the book is finished even short of a 100% target", () => {
		const goal = deadlineGoal("2026-03-10");
		const p = plan(
			input(goal, {
				now: at("2026-03-10", "21:00"),
				sessions: [
					session("2026-03-09", "20:00", 0, 900),
					session("2026-03-10", "20:00", 900, 960),
				],
				book: { wordCount: WORDS, wordPosition: wordPos(960) },
			}),
		);
		expect(p.dailyTarget.words).toBe(100);
		expect(p.isComplete).toBe(true);
		expect(p.isTodayMet).toBe(true);
		expect(p.isTodayMet).toBe(true);
		// 03-09 (900 of a 100 target) and the finishing day 03-10.
		expect(p.daysTargetMet).toBe(2);
	});

	it("credits a past finishing day once, not every day after it", () => {
		const goal = paceGoal(50);
		const p = plan(
			input(goal, {
				now: at("2026-03-05"),
				sessions: [
					session("2026-03-01", "20:00", 0, 400),
					session("2026-03-02", "20:00", 400, 960),
				],
				book: { wordCount: WORDS, wordPosition: wordPos(960) },
			}),
		);
		// 03-01 missed (400 of 500), 03-02 finished; 03-03 onward has nothing left.
		expect(p.daysTargetMet).toBe(1);
	});

	it("is complete once the position crosses the finished threshold", () => {
		const goal = deadlineGoal("2026-03-10");
		const p = plan(
			input(goal, {
				sessions: [session("2026-03-01", "11:00", 0, 960)],
				book: { wordCount: WORDS, wordPosition: 960 },
			}),
		);
		expect(p.isComplete).toBe(true);
		expect(p.daysLeft).toBe(0);
		expect(p.projectedFinishDate).toBe("2026-03-01");
	});

	it("is complete from the start for a book already past the target", () => {
		const p = plan(input(deadlineGoal("2026-03-10", at("2026-03-01", "10:00"), WORDS)));
		expect(p.isComplete).toBe(true);
		expect(p.dailyTarget.words).toBe(0);
		expect(p.isTodayMet).toBe(true);
	});

	it("dates the finish from a stored completion", () => {
		const goal = {
			...deadlineGoal("2026-03-10"),
			status: "completed" as const,
			completedAt: at("2026-03-04"),
		};
		const p = plan(input(goal, { now: at("2026-03-09") }));
		expect(p.isComplete).toBe(true);
		expect(p.projectedFinishDate).toBe("2026-03-04");
	});
});

describe("counters", () => {
	it("counts days read and days the target was met for this book only", () => {
		const goal = deadlineGoal("2026-03-10");
		const p = plan(
			input(goal, {
				now: at("2026-03-05", "08:00"),
				sessions: [
					session("2026-03-01", "20:00", 0, 100), // met (100)
					session("2026-03-02", "20:00", 100, 150), // read, target 100 missed
					session("2026-03-04", "20:00", 150, 400), // met (target 122)
				],
				book: { wordCount: WORDS, wordPosition: 400 },
			}),
		);
		expect(p.daysRead).toBe(3);
		expect(p.daysTargetMet).toBe(2);
	});

	it("includes today once its target is met", () => {
		const goal = deadlineGoal("2026-03-10");
		const p = plan(
			input(goal, {
				sessions: [session("2026-03-01", "11:00", 0, 100)],
				book: { wordCount: WORDS, wordPosition: 100 },
			}),
		);
		expect(p.daysTargetMet).toBe(1);
	});

	it("ignores reading earlier on the day the goal was created", () => {
		const created = at("2026-03-01", "15:00");
		const goal = deadlineGoal("2026-03-10", created, 200);
		const p = plan(
			input(goal, {
				now: at("2026-03-01", "16:00"),
				sessions: [session("2026-03-01", "09:00", 0, 200)],
				book: { wordCount: WORDS, wordPosition: 200 },
			}),
		);
		expect(p.dayStartWord).toBe(200);
		expect(p.progressToday.words).toBe(0);
		expect(p.daysRead).toBe(0);
		// 800 left over 10 days.
		expect(p.dailyTarget.words).toBe(80);
	});
});

describe("latching today's target", () => {
	const goal = deadlineGoal("2026-03-10");
	/** One sitting's row, rewritten by every checkpoint: it ends wherever the reader is now. */
	const sitting = (endWord: number, furthestWord: number | null) => ({
		...session("2026-03-01", "11:00", 0, endWord),
		furthestWord,
	});

	it("stays met after moving back within the same sitting", () => {
		const p = plan(
			input(goal, {
				sessions: [sitting(95, 120)],
				book: { wordCount: WORDS, wordPosition: 95 },
			}),
		);
		expect(p.furthestTodayWord).toBe(120);
		expect(p.progressToday.words).toBe(120);
		expect(p.isTodayMet).toBe(true);
		expect(p.daysTargetMet).toBe(1);
	});

	it("is not met by moving back before reaching the target", () => {
		const p = plan(
			input(goal, {
				sessions: [sitting(60, 80)],
				book: { wordCount: WORDS, wordPosition: 60 },
			}),
		);
		expect(p.progressToday.words).toBe(80);
		expect(p.isTodayMet).toBe(false);
		expect(p.daysTargetMet).toBe(0);
	});

	it("does not count a jump ahead and back, but counts one the reader stays at", () => {
		const back = plan(
			input(goal, {
				sessions: [sitting(40, 50)],
				book: { wordCount: WORDS, wordPosition: 40 },
			}),
		);
		expect(back.isTodayMet).toBe(false);
		const stayed = plan(
			input(goal, {
				sessions: [sitting(400, 50)],
				book: { wordCount: WORDS, wordPosition: 400 },
			}),
		);
		expect(stayed.isTodayMet).toBe(true);
	});

	it("counts reading no session records, such as on a paired device, from the saved position", () => {
		const p = plan(input(goal, { book: { wordCount: WORDS, wordPosition: 130 } }));
		expect(p.furthestTodayWord).toBe(130);
		expect(p.progressToday.words).toBe(130);
		expect(p.isTodayMet).toBe(true);
		expect(p.daysTargetMet).toBe(1);
	});

	it("counts a past day by where it ended when its sessions read less", () => {
		const p = plan(
			input(goal, {
				now: at("2026-03-02", "08:00"),
				sessions: [sitting(130, 20)],
				book: { wordCount: WORDS, wordPosition: 130 },
			}),
		);
		expect(p.daysTargetMet).toBe(1);
	});

	it("skips rows with nothing read, e.g. all of it rewound as browsing", () => {
		const p = plan(
			input(goal, {
				sessions: [{ ...sitting(0, null), endWord: 0, wordsRead: 0 }],
				book: { wordCount: WORDS, wordPosition: 0 },
			}),
		);
		expect(p.furthestTodayWord).toBe(0);
	});

	it("falls back to the end word on rows from before the furthest word was recorded", () => {
		const p = plan(
			input(goal, {
				sessions: [sitting(120, null)],
				book: { wordCount: WORDS, wordPosition: 120 },
			}),
		);
		expect(p.isTodayMet).toBe(true);
	});

	it("keeps a past day met, and the next day starts from where that day ended", () => {
		const p = plan(
			input(goal, {
				now: at("2026-03-02", "08:00"),
				sessions: [session("2026-03-01", "11:00", 0, 120), session("2026-03-01", "20:00", 120, 90)],
				book: { wordCount: WORDS, wordPosition: 90 },
			}),
		);
		expect(p.daysTargetMet).toBe(1);
		expect(p.dayStartWord).toBe(90);
		expect(p.furthestTodayWord).toBe(90);
		expect(p.progressToday.words).toBe(0);
		expect(p.isTodayMet).toBe(false);
		// 910 left over 9 days.
		expect(p.dailyTarget.words).toBe(102);
	});
});

describe("DST", () => {
	it("counts calendar days across the spring-forward night", () => {
		const goal = deadlineGoal("2026-03-31", at("2026-03-28", "10:00"));
		const p = plan(input(goal, { now: at("2026-03-28") }));
		expect(p.dailyTarget.words).toBe(250);

		const next = plan(
			input(goal, {
				now: at("2026-03-29", "00:30"),
				sessions: [session("2026-03-28", "23:30", 0, 250)],
				book: { wordCount: WORDS, wordPosition: 250 },
			}),
		);
		expect(next.today).toBe("2026-03-29");
		expect(next.dayStartWord).toBe(250);
		expect(next.dailyTarget.words).toBe(250);
		expect(next.daysLeft).toBe(3);
	});

	it("keeps a session just after the short night's midnight on the new day", () => {
		const goal = deadlineGoal("2026-03-31", at("2026-03-28", "10:00"));
		const p = plan(
			input(goal, {
				now: at("2026-03-29", "12:00"),
				sessions: [session("2026-03-29", "00:30", 0, 100)],
				book: { wordCount: WORDS, wordPosition: 100 },
			}),
		);
		expect(p.dayStartWord).toBe(0);
		expect(p.progressToday.words).toBe(100);
	});
});

describe("unknown word count", () => {
	it("returns no plan but still counts days read", () => {
		const goal = deadlineGoal("2026-03-10");
		const result = planReadingGoal(
			input(goal, {
				book: { wordCount: 0, wordPosition: 0 },
				sessions: [session("2026-03-01", "11:00", 0, 50)],
			}),
		);
		expect(result).toEqual({ kind: "unknown-length", daysRead: 1, isComplete: false });
	});
});

describe("series", () => {
	it("draws the plan line from the baseline to the target date and the actual line to today", () => {
		const goal = deadlineGoal("2026-03-10");
		const p = plan(
			input(goal, {
				now: at("2026-03-03"),
				sessions: [
					session("2026-03-01", "20:00", 0, 100),
					session("2026-03-02", "20:00", 100, 150),
				],
				book: { wordCount: WORDS, wordPosition: 170 },
			}),
		);
		expect(p.planSeries[0]).toEqual({ date: "2026-02-28", percent: 0 });
		expect(p.planSeries.at(-1)).toEqual({ date: "2026-03-10", percent: 100 });
		expect(p.planSeries).toHaveLength(11);
		expect(p.actualSeries.map((point) => point.percent)).toEqual([0, 10, 15, 17]);
		expect(p.actualSeries.at(-1)?.date).toBe("2026-03-03");
	});
});

describe("pre-goal history", () => {
	it("is empty without reading before the goal", () => {
		const goal = deadlineGoal("2026-03-10", at("2026-03-01", "15:00"), 200);
		const p = plan(
			input(goal, {
				sessions: [session("2026-03-01", "09:00", 0, 200)],
				book: { wordCount: WORDS, wordPosition: wordPos(200) },
			}),
		);
		expect(p.historySeries).toEqual([]);
	});

	it("carries end-of-day positions across unread days up to the goal's start", () => {
		const goal = deadlineGoal("2026-03-10", at("2026-03-05", "10:00"), 300);
		const p = plan(
			input(goal, {
				now: at("2026-03-05"),
				sessions: [
					session("2026-03-01", "20:00", 0, 100),
					session("2026-03-01", "22:00", 100, 150),
					session("2026-03-03", "20:00", 150, 300),
				],
				book: { wordCount: WORDS, wordPosition: wordPos(300) },
			}),
		);
		expect(p.historySeries).toEqual([
			{ date: "2026-03-01", percent: 15 },
			{ date: "2026-03-02", percent: 15 },
			{ date: "2026-03-03", percent: 30 },
			{ date: "2026-03-04", percent: 30 },
		]);
	});

	it("is trimmed to the plan's span", () => {
		const goal = deadlineGoal("2026-03-10", at("2026-03-01", "10:00"), 500);
		const p = plan(
			input(goal, {
				sessions: [session("2026-01-01", "20:00", 0, 500)],
				book: { wordCount: WORDS, wordPosition: wordPos(500) },
			}),
		);
		expect(p.historySeries).toHaveLength(11);
		expect(p.historySeries[0]).toEqual({ date: "2026-02-18", percent: 50 });
		expect(p.historySeries.at(-1)).toEqual({ date: "2026-02-28", percent: 50 });
	});
});

describe("replanGoal", () => {
	const history: GoalSession[] = [
		session("2026-03-01", "20:00", 0, 100), // met
		session("2026-03-02", "20:00", 100, 120), // missed
		session("2026-03-03", "09:00", 120, 140), // today, before the switch
	];
	const now = at("2026-03-03", "10:00");

	it("switches deadline to pace at today's daily target and keeps progress", () => {
		const goal = deadlineGoal("2026-03-10");
		const before = plan(
			input(goal, { now, sessions: history, book: { wordCount: WORDS, wordPosition: 140 } }),
		);
		const fields = replanGoal(
			input(goal, { now, sessions: history, book: { wordCount: WORDS, wordPosition: 140 } }),
			{ mode: "pace" },
		);
		expect(fields).toMatchObject({
			mode: "pace",
			planStartDate: "2026-03-03",
			planStartWord: 120,
			carriedDaysMet: 1,
		});
		expect(fields.dailyPercent).toBeCloseTo(before.dailyTarget.percent);

		const after = plan(
			input(
				{ ...goal, ...fields },
				{ now, sessions: history, book: { wordCount: WORDS, wordPosition: 140 } },
			),
		);
		expect(after.dailyTarget.words).toBe(before.dailyTarget.words);
		expect(after.progressToday.words).toBe(20);
		expect(after.daysTargetMet).toBe(1);
		expect(after.projectedFinishDate).toBe("2026-03-10");
	});

	it("switches pace to deadline at the projected finish date", () => {
		const goal = paceGoal(10);
		const book = { wordCount: WORDS, wordPosition: wordPos(140) };
		const before = plan(input(goal, { now, sessions: history, book }));
		const fields = replanGoal(input(goal, { now, sessions: history, book }), { mode: "deadline" });
		expect(fields.targetDate).toBe(before.projectedFinishDate);

		const after = plan(input({ ...goal, ...fields }, { now, sessions: history, book }));
		expect(after.mode).toBe("deadline");
		expect(after.projectedFinishDate).toBe(before.projectedFinishDate);
		expect(after.daysTargetMet).toBe(1);
		expect(after.aheadBehind.words).toBe(0);
	});

	it("restarts the plan line, so earlier misses no longer count as behind", () => {
		const goal = deadlineGoal("2026-03-10");
		const book = { wordCount: WORDS, wordPosition: wordPos(140) };
		expect(plan(input(goal, { now, sessions: history, book })).aheadBehind.words).toBeLessThan(0);
		const fields = replanGoal(input(goal, { now, sessions: history, book }), {
			targetDate: "2026-03-20",
		});
		const after = plan(input({ ...goal, ...fields }, { now, sessions: history, book }));
		expect(after.aheadBehind.words).toBe(0);
		expect(after.targetDate).toBe("2026-03-20");
	});
});
