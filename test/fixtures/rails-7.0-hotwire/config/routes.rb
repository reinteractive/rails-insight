Rails.application.routes.draw do
  devise_for :users

  resources :posts do
    resources :comments, only: [:create, :destroy]
    member do
      patch :publish
    end
  end

  resources :users, only: [:show, :index]

  root "posts#index"
end
