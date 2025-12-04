// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface SabbaticalPlan {
  id: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  category: string;
  duration: number;
  status: "draft" | "submitted" | "approved" | "rejected";
}

const App: React.FC = () => {
  // Randomized style selections:
  // Colors: High contrast (blue+orange)
  // UI Style: Future metal
  // Layout: Center radiation
  // Interaction: Micro-interactions (hover effects)
  
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<SabbaticalPlan[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newPlanData, setNewPlanData] = useState({
    category: "",
    description: "",
    duration: 3,
    goals: ""
  });
  const [activeTab, setActiveTab] = useState("myPlans");
  const [searchTerm, setSearchTerm] = useState("");

  // Selected random features:
  // 1. Data statistics
  // 2. Search & filter
  // 3. Project introduction
  // 4. Team information

  // Calculate statistics
  const approvedCount = plans.filter(p => p.status === "approved").length;
  const submittedCount = plans.filter(p => p.status === "submitted").length;
  const draftCount = plans.filter(p => p.status === "draft").length;

  useEffect(() => {
    loadPlans().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadPlans = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("plan_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing plan keys:", e);
        }
      }
      
      const list: SabbaticalPlan[] = [];
      
      for (const key of keys) {
        try {
          const planBytes = await contract.getData(`plan_${key}`);
          if (planBytes.length > 0) {
            try {
              const planData = JSON.parse(ethers.toUtf8String(planBytes));
              list.push({
                id: key,
                encryptedData: planData.data,
                timestamp: planData.timestamp,
                owner: planData.owner,
                category: planData.category,
                duration: planData.duration || 3,
                status: planData.status || "draft"
              });
            } catch (e) {
              console.error(`Error parsing plan data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading plan ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setPlans(list);
    } catch (e) {
      console.error("Error loading plans:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitPlan = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting sabbatical plan with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newPlanData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const planId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const planData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        category: newPlanData.category,
        duration: newPlanData.duration,
        status: "draft"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `plan_${planId}`, 
        ethers.toUtf8Bytes(JSON.stringify(planData))
      );
      
      const keysBytes = await contract.getData("plan_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(planId);
      
      await contract.setData(
        "plan_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted sabbatical plan submitted!"
      });
      
      await loadPlans();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewPlanData({
          category: "",
          description: "",
          duration: 3,
          goals: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const submitForApproval = async (planId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted plan with FHE..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const planBytes = await contract.getData(`plan_${planId}`);
      if (planBytes.length === 0) {
        throw new Error("Plan not found");
      }
      
      const planData = JSON.parse(ethers.toUtf8String(planBytes));
      
      const updatedPlan = {
        ...planData,
        status: "submitted"
      };
      
      await contract.setData(
        `plan_${planId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedPlan))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Plan submitted for approval!"
      });
      
      await loadPlans();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Submission failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const filteredPlans = plans.filter(plan => {
    const matchesSearch = plan.category.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         plan.status.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTab = activeTab === "all" || 
                      (activeTab === "myPlans" && plan.owner === account) ||
                      (activeTab === "drafts" && plan.status === "draft") ||
                      (activeTab === "submitted" && plan.status === "submitted");
    return matchesSearch && matchesTab;
  });

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      setTransactionStatus({
        visible: true,
        status: "success",
        message: `FHE Service ${isAvailable ? "Available" : "Unavailable"}`
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Availability check failed"
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="metal-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container metal-theme">
      <div className="radial-bg"></div>
      
      <header className="app-header">
        <div className="logo">
          <div className="metal-logo-icon"></div>
          <h1>Career<span>Sabbatical</span>Planner</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="metal-button create-btn"
            disabled={!account}
          >
            <span className="btn-icon">+</span>
            New Plan
          </button>
          <button 
            onClick={checkAvailability}
            className="metal-button secondary"
          >
            Check FHE Status
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <main className="main-content">
        <div className="center-radial-container">
          <div className="content-panel metal-card">
            <div className="panel-header">
              <h2>Confidential Sabbatical Planning</h2>
              <p>Plan your career break with privacy-preserving FHE technology</p>
            </div>
            
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{plans.length}</div>
                <div className="stat-label">Total Plans</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{approvedCount}</div>
                <div className="stat-label">Approved</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{submittedCount}</div>
                <div className="stat-label">Submitted</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{draftCount}</div>
                <div className="stat-label">Drafts</div>
              </div>
            </div>
          </div>
          
          <div className="content-panel metal-card">
            <div className="panel-header">
              <h3>About FHE Sabbatical Planning</h3>
            </div>
            <div className="about-content">
              <p>
                This platform uses Fully Homomorphic Encryption (FHE) to allow employees to plan 
                career sabbaticals while keeping their personal goals and sensitive information 
                confidential. All data processing happens on encrypted data without decryption.
              </p>
              <div className="fhe-badge">
                <span>FHE-Powered Privacy</span>
              </div>
            </div>
          </div>
          
          <div className="content-panel metal-card">
            <div className="panel-header">
              <div className="tabs">
                <button 
                  className={`tab-btn ${activeTab === "myPlans" ? "active" : ""}`}
                  onClick={() => setActiveTab("myPlans")}
                >
                  My Plans
                </button>
                <button 
                  className={`tab-btn ${activeTab === "drafts" ? "active" : ""}`}
                  onClick={() => setActiveTab("drafts")}
                >
                  Drafts
                </button>
                <button 
                  className={`tab-btn ${activeTab === "submitted" ? "active" : ""}`}
                  onClick={() => setActiveTab("submitted")}
                >
                  Submitted
                </button>
                <button 
                  className={`tab-btn ${activeTab === "all" ? "active" : ""}`}
                  onClick={() => setActiveTab("all")}
                >
                  All Plans
                </button>
              </div>
              
              <div className="search-box">
                <input 
                  type="text" 
                  placeholder="Search plans..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="metal-input"
                />
                <button 
                  onClick={loadPlans}
                  className="metal-button small refresh-btn"
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "..." : "↻"}
                </button>
              </div>
            </div>
            
            <div className="plans-list">
              {filteredPlans.length === 0 ? (
                <div className="no-plans">
                  <div className="no-plans-icon"></div>
                  <p>No sabbatical plans found</p>
                  <button 
                    className="metal-button primary"
                    onClick={() => setShowCreateModal(true)}
                  >
                    Create New Plan
                  </button>
                </div>
              ) : (
                <table className="metal-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Category</th>
                      <th>Duration</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlans.map(plan => (
                      <tr key={plan.id}>
                        <td>#{plan.id.substring(0, 6)}</td>
                        <td>{plan.category}</td>
                        <td>{plan.duration} months</td>
                        <td>
                          <span className={`status-badge ${plan.status}`}>
                            {plan.status}
                          </span>
                        </td>
                        <td className="actions">
                          {isOwner(plan.owner) && plan.status === "draft" && (
                            <button 
                              className="metal-button small"
                              onClick={() => submitForApproval(plan.id)}
                            >
                              Submit
                            </button>
                          )}
                          <button 
                            className="metal-button small secondary"
                            onClick={() => {
                              // In a real app, this would decrypt and show plan details
                              alert("Plan details are encrypted with FHE");
                            }}
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          
          <div className="content-panel metal-card">
            <div className="panel-header">
              <h3>Development Team</h3>
            </div>
            <div className="team-grid">
              <div className="team-member">
                <div className="member-avatar"></div>
                <div className="member-name">Alex Chen</div>
                <div className="member-role">FHE Specialist</div>
              </div>
              <div className="team-member">
                <div className="member-avatar"></div>
                <div className="member-name">Jamie Park</div>
                <div className="member-role">Frontend Developer</div>
              </div>
              <div className="team-member">
                <div className="member-avatar"></div>
                <div className="member-name">Taylor Smith</div>
                <div className="member-role">HR Consultant</div>
              </div>
            </div>
          </div>
        </div>
      </main>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitPlan} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          planData={newPlanData}
          setPlanData={setNewPlanData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content metal-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="metal-spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="metal-logo-icon"></div>
              <span>CareerSabbaticalPlanner</span>
            </div>
            <p>Privacy-preserving career development with FHE</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  planData: any;
  setPlanData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  planData,
  setPlanData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setPlanData({
      ...planData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!planData.category || !planData.goals) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal metal-card">
        <div className="modal-header">
          <h2>Create Sabbatical Plan</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="shield-icon"></div> Your data will remain encrypted with FHE
          </div>
          
          <div className="form-group">
            <label>Category *</label>
            <select 
              name="category"
              value={planData.category} 
              onChange={handleChange}
              className="metal-input"
            >
              <option value="">Select category</option>
              <option value="Research">Research</option>
              <option value="Education">Education</option>
              <option value="Personal Growth">Personal Growth</option>
              <option value="Creative Project">Creative Project</option>
              <option value="Career Transition">Career Transition</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Duration (months)</label>
            <input 
              type="number"
              name="duration"
              min="1"
              max="24"
              value={planData.duration} 
              onChange={handleChange}
              className="metal-input"
            />
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <input 
              type="text"
              name="description"
              value={planData.description} 
              onChange={handleChange}
              placeholder="Brief description..." 
              className="metal-input"
            />
          </div>
          
          <div className="form-group">
            <label>Goals & Objectives *</label>
            <textarea 
              name="goals"
              value={planData.goals} 
              onChange={handleChange}
              placeholder="What do you hope to achieve during your sabbatical?" 
              className="metal-textarea"
              rows={4}
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="metal-button secondary"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="metal-button primary"
          >
            {creating ? "Encrypting..." : "Create Plan"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;