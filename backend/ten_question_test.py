"""
10-Question Real Acceptance Test for HR and Executive Agents.
Tests through actual FastAPI endpoints with real Groq tool-calling and MongoDB data.
"""
import asyncio
import json
import time
import httpx

BACKEND_URL = "http://localhost:8000"
RESULTS = []


def get_token():
    r = httpx.post(f"{BACKEND_URL}/api/v1/auth/login",
                   json={"email": "admin@demo.com", "password": "Admin@123"}, timeout=10)
    r.raise_for_status()
    return r.json()["access_token"]


def call_hr_agent(token, message, history=None, timeout=120):
    payload = {"message": message}
    if history:
        payload["conversation_history"] = history
    r = httpx.post(f"{BACKEND_URL}/api/v1/hr-agent/chat",
                   headers={"Authorization": f"Bearer {token}"},
                   json=payload, timeout=timeout)
    return r.status_code, r.json() if r.status_code == 200 else {"error": r.text[:500]}


def call_executive_agent(token, message, history=None, timeout=120):
    payload = {"message": message}
    if history:
        payload["conversation_history"] = history
    r = httpx.post(f"{BACKEND_URL}/api/v1/executive-agent/chat",
                   headers={"Authorization": f"Bearer {token}"},
                   json=payload, timeout=timeout)
    return r.status_code, r.json() if r.status_code == 200 else {"error": r.text[:500]}


def record(question, agent, status_code, data, hr_score=None, exec_score=None):
    tools = []
    if "tool_executions" in data:
        tools = [t["tool_name"] for t in data["tool_executions"]]
    steps = data.get("steps_used", "?")
    model = data.get("model", "?")
    answer = data.get("answer", data.get("message", data.get("error", "NO ANSWER")))
    real_data = "NO"
    if tools:
        real_data = "YES"
    hallucination = "UNCHECKED"
    if answer and "not found" in answer.lower():
        hallucination = "SAFE"
    elif answer and "does not exist" in answer.lower():
        hallucination = "SAFE"
    elif answer and "unable to" in answer.lower():
        hallucination = "SAFE"
    elif tools:
        hallucination = "LIKELY SAFE (used tools)"
    
    result = {
        "question": question,
        "agent": agent,
        "status_code": status_code,
        "model": model,
        "tools": tools,
        "tool_count": len(tools),
        "steps": steps,
        "answer_preview": (answer[:300] if answer else "NONE"),
        "answer_full": answer,
        "real_data": real_data,
        "hallucination": hallucination,
    }
    RESULTS.append(result)
    return result


async def main():
    print("=" * 70)
    print("10-QUESTION REAL ACCEPTANCE TEST")
    print("=" * 70)
    
    token = get_token()
    print(f"\nToken obtained.")
    
    # ================================================================
    # HR QUESTIONS
    # ================================================================
    print("\n" + "=" * 70)
    print("PART A — HR AGENT (5 QUESTIONS)")
    print("=" * 70)
    
    # HR Q1
    print("\n--- HR Q1: Employee 360 ---")
    q = "Tell me everything important about Riya Jain."
    t0 = time.time()
    code, data = call_hr_agent(token, q)
    dt = time.time() - t0
    r = record(q, "hr_operations_agent", code, data)
    print(f"  Status: {code} | Steps: {r['steps']} | Tools: {r['tools']} | Time: {dt:.1f}s")
    print(f"  Answer: {r['answer_preview'][:200]}")
    
    # HR Q2 (follow-up, same conversation)
    print("\n--- HR Q2: Attendance Follow-up ---")
    q2 = "How is her attendance this month? Is there anything HR should be concerned about?"
    history = [{"role": "user", "content": q}, {"role": "assistant", "content": r["answer_full"][:500]}]
    t0 = time.time()
    code, data = call_hr_agent(token, q2, history=history)
    dt = time.time() - t0
    r2 = record(q2, "hr_operations_agent", code, data)
    print(f"  Status: {code} | Steps: {r2['steps']} | Tools: {r2['tools']} | Time: {dt:.1f}s")
    print(f"  Answer: {r2['answer_preview'][:200]}")
    
    # HR Q3
    print("\n--- HR Q3: Payroll/Payslip ---")
    q3 = "Does Riya have any salary, payroll, or payslip issue right now?"
    t0 = time.time()
    code, data = call_hr_agent(token, q3)
    dt = time.time() - t0
    r3 = record(q3, "hr_operations_agent", code, data)
    print(f"  Status: {code} | Steps: {r3['steps']} | Tools: {r3['tools']} | Time: {dt:.1f}s")
    print(f"  Answer: {r3['answer_preview'][:200]}")
    
    # HR Q4
    print("\n--- HR Q4: Recruitment Blocker ---")
    q4 = "Why has Rahul Sharma not moved forward in the recruitment process?"
    t0 = time.time()
    code, data = call_hr_agent(token, q4)
    dt = time.time() - t0
    r4 = record(q4, "hr_operations_agent", code, data)
    print(f"  Status: {code} | Steps: {r4['steps']} | Tools: {r4['tools']} | Time: {dt:.1f}s")
    print(f"  Answer: {r4['answer_preview'][:200]}")
    
    # HR Q5
    print("\n--- HR Q5: HR Attention Today ---")
    q5 = "What needs HR's attention today?"
    t0 = time.time()
    code, data = call_hr_agent(token, q5)
    dt = time.time() - t0
    r5 = record(q5, "hr_operations_agent", code, data)
    print(f"  Status: {code} | Steps: {r5['steps']} | Tools: {r5['tools']} | Time: {dt:.1f}s")
    print(f"  Answer: {r5['answer_preview'][:200]}")
    
    # ================================================================
    # EXECUTIVE QUESTIONS
    # ================================================================
    print("\n" + "=" * 70)
    print("PART B — EXECUTIVE AGENT (5 QUESTIONS)")
    print("=" * 70)
    
    # CEO Q1
    print("\n--- CEO Q1: Company Health ---")
    q6 = "What needs my attention today as CEO?"
    t0 = time.time()
    code, data = call_executive_agent(token, q6)
    dt = time.time() - t0
    r6 = record(q6, "executive_operations_agent", code, data)
    print(f"  Status: {code} | Steps: {r6['steps']} | Tools: {r6['tools']} | Time: {dt:.1f}s")
    print(f"  Answer: {r6['answer_preview'][:200]}")
    
    # CEO Q2
    print("\n--- CEO Q2: Employee Work ---")
    q7 = "What work is assigned to Dave Emp, and what did they complete today?"
    t0 = time.time()
    code, data = call_executive_agent(token, q7)
    dt = time.time() - t0
    r7 = record(q7, "executive_operations_agent", code, data)
    print(f"  Status: {code} | Steps: {r7['steps']} | Tools: {r7['tools']} | Time: {dt:.1f}s")
    print(f"  Answer: {r7['answer_preview'][:200]}")
    
    # CEO Q3
    print("\n--- CEO Q3: Project Root Cause ---")
    q8 = "Why is E-Commerce Platform delayed or at risk?"
    t0 = time.time()
    code, data = call_executive_agent(token, q8)
    dt = time.time() - t0
    r8 = record(q8, "executive_operations_agent", code, data)
    print(f"  Status: {code} | Steps: {r8['steps']} | Tools: {r8['tools']} | Time: {dt:.1f}s")
    print(f"  Answer: {r8['answer_preview'][:200]}")
    
    # CEO Q4
    print("\n--- CEO Q4: Client Cross-Domain ---")
    q9 = "Give me the complete current situation of RetailX Pvt Ltd. Is there anything that could make us lose this client?"
    t0 = time.time()
    code, data = call_executive_agent(token, q9)
    dt = time.time() - t0
    r9 = record(q9, "executive_operations_agent", code, data)
    print(f"  Status: {code} | Steps: {r9['steps']} | Tools: {r9['tools']} | Time: {dt:.1f}s")
    print(f"  Answer: {r9['answer_preview'][:200]}")
    
    # CEO Q5
    print("\n--- CEO Q5: Sales + Finance ---")
    q10 = "How is the business performing this month in sales and collections, and what should I focus on?"
    t0 = time.time()
    code, data = call_executive_agent(token, q10)
    dt = time.time() - t0
    r10 = record(q10, "executive_operations_agent", code, data)
    print(f"  Status: {code} | Steps: {r10['steps']} | Tools: {r10['tools']} | Time: {dt:.1f}s")
    print(f"  Answer: {r10['answer_preview'][:200]}")
    
    # ================================================================
    # SAVE RESULTS
    # ================================================================
    with open("ten_question_results.json", "w") as f:
        json.dump(RESULTS, f, indent=2, default=str)
    print(f"\nResults saved to ten_question_results.json")


if __name__ == "__main__":
    asyncio.run(main())
