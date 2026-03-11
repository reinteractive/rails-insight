Rails.application.routes.draw do
  devise_for :users

  resources :posts do
    member do
      patch :publish
    end
  end

  root "posts#index"
end
