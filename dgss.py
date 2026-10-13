
# @title Default title text
import hashlib
import random
from math import gcd
from datetime import datetime
import secrets

# ===== System Parameters =====
#p = 227           # prime modulus (small for demo)
#q = 113           # prime order, q | (p-1)
#g = 4             # generator of order q in Z_p*


def is_prime(n, k=10):
    if n < 2:
        return False

    # Small prime check
    small_primes = [2,3,5,7,11,13,17,19,23,29]
    for p in small_primes:
        if n % p == 0:
            return n == p

    # Write n-1 as 2^r * d
    r, d = 0, n - 1
    while d % 2 == 0:
        r += 1
        d //= 2

    for _ in range(k):
        a = secrets.randbelow(n - 3) + 2
        x = pow(a, d, n)

        if x == 1 or x == n - 1:
            continue

        for _ in range(r - 1):
            x = pow(x, 2, n)
            if x == n - 1:
                break
        else:
            return False

    return True


# ------------------------------
# Generate 8-bit prime q
# ------------------------------
def generate_8bit_prime():
    while True:
        q = secrets.randbits(8)
        q |= (1 << 7)  # ensure 7-bit
        q |= 1          # make odd

        if is_prime(q):
            return q


# ------------------------------
# Generate p = kq + 1 prime
# ------------------------------
def generate_p_from_q(q):
    while True:
        k = secrets.randbelow(2**8) + 2
        p = k*q + 1

        if is_prime(p):
            return p, k

# ------------------------------
# Find generator of subgroup order q
# ------------------------------
def find_generator(p, q):
    while True:
        h = secrets.randbelow(p - 2) + 2
        g = pow(h, (p - 1)//q, p)

        if g != 1:
            return g


# ------------------------------
# Run everything
# ------------------------------
starttime = datetime.now()
print("Start time:", starttime)
q = generate_8bit_prime()
p, k = generate_p_from_q(q)
g = find_generator(p, q)

print("Prime q (8-bit):", q)
print("Prime p = kq + 1:", p)
print("k:", k)
print("Generator g:", g)
endtime = datetime.now()
print("End time:", endtime)
print("Duration:", endtime - starttime)

def hash_to_Zq(x, q):
    h = hashlib.sha256(str(x).encode()).hexdigest()
    return int(h, 16) % q

class Authority:
    def __init__(self, name):
        self.name = name
        self.x = random.randint(1, q-1)       # private key
        self.y = pow(g, self.x, p)             # public key

        print(f"{self.name} Public Key: {self.y}")
        print(f"{self.name} Private Key: {self.x}")

    def issue_certificate(self, user_pub):
        k = random.randint(1, q-1)
        r = (user_pub * k - self.x) % q
        s = pow(user_pub, k, p)

        print(f"{self.name} Issued Certificate: r={r}, s={s}, k={k}")
        return r, s, k

class LandOwner:
    def __init__(self, owner_id):
        self.id = owner_id
        self.x = random.randint(1, q-1)     # private key
        self.y = pow(g, self.x, p)           # public key
        self.R = 0
        self.S = 1
        self.k_values = []

    def build_certificate(self, certs):
        for r, s, k in certs:
            self.R = (self.R + r) % q
            self.S = (self.S * s) % p
            self.k_values.append(k)

    def dgss_verify_correctness(self, authorities):
      left = pow(self.S,self.y,p)
      print("Left:", left)
      rightA = 1
      for autho in authorities:
        rightA = rightA * autho.y
      #print("RightA:", rightA)
      right = pow(pow(g,self.R)*rightA,self.x,p)
      print("Right:", right)
      return left == right


def dgss_sign(owner, message, receiver_pub):
    N1 = random.randint(1, q-1)
    N2 = random.randint(1, q-1)

    A = (owner.x * N1 * N2) % q
    B = pow(owner.S, N1 * N2 * owner.y,p)

    hB = hash_to_Zq(B, q)
    C = (message * pow(receiver_pub, -N1 * A * hB, p)) % p

    hC = hash_to_Zq(C, q)
    D = (N1 - owner.R * hC) % q

    signature = {
        "A": A,
        "B": B,
        "C": C,
        "D": D
    }

    print("Signature:", signature)
    return signature

def dgss_verify(signature, receiver_priv, authorities_pub):
    A, B, C, D = signature.values()

    hC = hash_to_Zq(C, q)
    hB = hash_to_Zq(B, q)
    Y = 1
    for y in authorities_pub:
        Y = (Y * y) % p

    term = (
        pow(g, D * A, p) *
        pow(Y, -A * hC, p) *
        pow(B, hC, p)
    ) % p

    M_recovered = (C * pow(term, receiver_priv*hB)) % p
    return M_recovered

def dgss_identify(signature, owners, authorities):
    A = signature["A"]
    B = signature["B"]

    for owner in owners:
        k_sum = sum(owner.k_values)
        test = pow(g, A * k_sum * owner.y, p)

        if test == B:
            return owner.id

    return None

# ===== Authorities =====
registrar = Authority("Registrar")
revenue = Authority("Revenue")
court = Authority("Court")
Bank = Authority("Bank")
authorities = [registrar, revenue, court, Bank]
#print("Authorities :",authorities)

# ===== Land Owner =====
owner_id = input ("Enter Owner ID:")
owner = LandOwner(owner_id)
print("Land Owner :",owner.id)

# ===== Certificate Issuance =====
certs = []
for auth in authorities:
    r, s, k = auth.issue_certificate(owner.y)
    certs.append((r, s, k))

owner.build_certificate(certs)

# ===== Verify Correctness =====
v_c = owner.dgss_verify_correctness(authorities)
print("Verified Correctness:", v_c)

# ===== Receiver (Bank / Buyer) =====
receiver_priv = random.randint(1, q-1)
receiver_pub = pow(g, receiver_priv, p)
print (receiver_priv)
print (receiver_pub)

# ===== Land Transaction =====
land_detail = input("Enter Land Details:")
print("Land Details:", land_detail)
land_detail_binary = ''.join(format(ord(char), '08b') for char in land_detail)
#print("Binary representation:", land_detail_binary)

timestamp = datetime.now()
print("Timestamp:", timestamp)
timestamp_binary = ''.join(format(ord(char), '08b') for char in str(timestamp))
#print("Binary representation:", timestamp_binary)

land = land_detail_binary + timestamp_binary
print("Land Check:", land)
print("Land Length:", int(land,2))

land_record_hash = hash_to_Zq(land, q)
print("Land Record Hash:", land_record_hash)

#land_record_hash = 221  # example (hash of land details)

signature = dgss_sign(owner, land_record_hash, receiver_pub)
print("Signature:", signature)

# ===== Verification =====
recovered = dgss_verify(
    signature,
    receiver_priv,
    [a.y for a in authorities]
)

print("Recovered Details:", recovered)

# ===== Identity Tracing =====
identified = dgss_identify(signature, [owner], authorities)
print("Signer identified as:", identified)