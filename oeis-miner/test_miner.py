"""EXP-005 harness validation — known sequences with known answers.

The miner must find exact recurrences where mathematics says they exist,
report the correct minimal order and coefficients, and REFUSE sequences
that have no low-order linear recurrence (primes, Catalan). One wrong
verdict fails the harness.
"""

from fractions import Fraction as F

from miner import find_recurrence, signature

PASS = FAIL = 0


def check(label, cond):
    global PASS, FAIL
    print(("PASS" if cond else "FAIL"), " ", label)
    if cond:
        PASS += 1
    else:
        FAIL += 1


fib = [0, 1]
while len(fib) < 30:
    fib.append(fib[-1] + fib[-2])
r = find_recurrence(fib)
check("Fibonacci: order 2, coeffs (1,1)", r == (2, (F(1), F(1))))

lucas = [2, 1]
while len(lucas) < 30:
    lucas.append(lucas[-1] + lucas[-2])
check("Lucas shares Fibonacci's signature",
      signature(find_recurrence(lucas)[1]) == signature(r[1]))

pow2 = [2 ** n for n in range(25)]
check("Powers of 2: order 1, coeff (2)", find_recurrence(pow2) == (1, (F(2),)))

squares = [n * n for n in range(25)]
check("Squares n²: order 3, coeffs (3,-3,1)",
      find_recurrence(squares) == (3, (F(3), F(-3), F(1))))

cubes = [n ** 3 for n in range(25)]
check("Cubes n³: order 4, coeffs (4,-6,4,-1)",
      find_recurrence(cubes) == (4, (F(4), F(-6), F(4), F(-1))))

trib = [0, 0, 1]
while len(trib) < 30:
    trib.append(trib[-1] + trib[-2] + trib[-3])
check("Tribonacci: order 3, coeffs (1,1,1)",
      find_recurrence(trib) == (3, (F(1), F(1), F(1))))

arith = [7 + 3 * n for n in range(25)]
check("Arithmetic 7+3n: order 2, coeffs (2,-1)",
      find_recurrence(arith) == (2, (F(2), F(-1))))

primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71]
check("Primes: REFUSED (no linear recurrence)", find_recurrence(primes) is None)

catalan = [1]
for n in range(1, 20):
    catalan.append(catalan[-1] * 2 * (2 * n - 1) // (n + 1))
check("Catalan: REFUSED (recurrence is not constant-coefficient)",
      find_recurrence(catalan) is None)

# adversarial: sequence that satisfies a recurrence for a while, then breaks
trap = fib[:20] + [999999]
check("Fibonacci-then-lie: REFUSED (verification catches the break)",
      find_recurrence(trap) is None)

# rational coefficients allowed: a(n) = a(n-1)*3/2 with integer terms
halfgrow = [2 ** 20]
for _ in range(20):
    halfgrow.append(halfgrow[-1] * 3 // 2)
r = find_recurrence(halfgrow)
check("Rational coefficient 3/2 found exactly", r == (1, (F(3, 2),)))

print(f"\n{PASS} passed, {FAIL} failed")
raise SystemExit(1 if FAIL else 0)
